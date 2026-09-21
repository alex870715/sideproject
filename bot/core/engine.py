"""交易主引擎。

職責：
- 接收市場數據（Bar）。
- 呼叫 StrategyManager 取得「regime + signal + force_flatten」。
- 將 Signal 轉譯為 Account 下單呼叫；處理「翻倉、拒單、餘額不足」等狀況。
- 維護一份結構化的事件日誌（給 Dashboard 訂閱）。

風險控制（簡化版）：
- 倉位大小：以 `equity * position_fraction` 計算名目倉位，再除以價格得到數量。
- 翻倉：若收到反向 BUY/SELL 訊號，先平掉現有倉位再開新倉。
- 強制平倉：當 manager 要求 panic flatten，直接清空該 symbol 的所有倉位。

Engine 不認識 UI；事件日誌透過 callback 對外發布，由 Dashboard 訂閱。
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from core.account import (
    InsufficientBalanceError,
    InvalidOrderError,
    PositionSide,
    Trade,
)
from core.broker import Broker
from core.strategy_manager import ManagerOutput, StrategyManager
from strategies.base_strategy import Bar, Signal, SignalAction


# ---------------------------------------------------------------------- #
# 事件
# ---------------------------------------------------------------------- #
class EventLevel(str, Enum):
    INFO = "INFO"
    TRADE = "TRADE"
    REGIME = "REGIME"
    PANIC = "PANIC"
    ERROR = "ERROR"


@dataclass(frozen=True)
class Event:
    timestamp: datetime
    level: EventLevel
    message: str
    payload: dict = field(default_factory=dict)


EventListener = Callable[[Event], None]


# ---------------------------------------------------------------------- #
# 引擎
# ---------------------------------------------------------------------- #
class TradingEngine:
    """交易引擎。

    Args:
        broker:           符合 `Broker` 介面的撮合層（LocalBroker / OKXBroker）。
        strategy_manager: 策略管理器。
        symbol:           本引擎服務的交易對。
        position_fraction: 每次開倉佔總權益的比例（0.1 = 10%）。
        leverage:         開倉槓桿（保留欄位）。
    """

    def __init__(
        self,
        broker: Broker,
        strategy_manager: StrategyManager,
        symbol: str,
        position_fraction: Decimal = Decimal("0.1"),
        leverage: int = 1,
    ) -> None:
        self.broker: Broker = broker
        self.strategy_manager = strategy_manager
        self.symbol = symbol
        self.position_fraction = Decimal(position_fraction)
        self.leverage = leverage

        self.last_price: Optional[Decimal] = None
        self.last_regime_output: Optional[ManagerOutput] = None
        self.events: List[Event] = []
        self._listeners: List[EventListener] = []
        # 用 broker 起始權益作為峰值的初值（OKXBroker 也能正確取得）
        self._equity_peak: Decimal = broker.equity({})
        self._max_drawdown: Decimal = Decimal("0")
        # live=False 時 on_bar 只更新策略指標、不執行訊號、不觸發 panic flatten。
        # 用於「熱機」階段：餵歷史 bar 給策略累積指標，但不真的下單到 broker。
        self.live: bool = True
        # 保護 engine 與 strategy_manager 的內部狀態：
        # engine_loop 在一個 thread（asyncio.to_thread）跑 on_bar，
        # web API handler 在另一個 thread 跑 set_active / update_params；
        # RLock 允許 on_bar 內部的 helper 重新取鎖。
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ #
    # 事件
    # ------------------------------------------------------------------ #
    def subscribe(self, listener: EventListener) -> None:
        self._listeners.append(listener)

    def _emit(
        self,
        level: EventLevel,
        message: str,
        timestamp: Optional[datetime] = None,
        **payload,
    ) -> None:
        evt = Event(
            timestamp=timestamp or (self.last_price and datetime.now()) or datetime.now(),
            level=level,
            message=message,
            payload=payload,
        )
        self.events.append(evt)
        if len(self.events) > 500:
            self.events = self.events[-500:]
        for fn in self._listeners:
            try:
                fn(evt)
            except Exception:  # noqa: BLE001 - listeners 不應影響交易主流程
                pass

    # ------------------------------------------------------------------ #
    # 主流程
    # ------------------------------------------------------------------ #
    def on_bar(self, bar: Bar) -> ManagerOutput:
        with self._lock:
            self.last_price = bar.close
            output = self.strategy_manager.process(bar)
            self.last_regime_output = output

            # 熱機模式：只讓策略累積歷史 / 指標；不下單、不切換 regime log、不算回撤
            if not self.live:
                return output

            if output.regime_changed:
                if self.strategy_manager.is_overridden:
                    msg = (
                        f"Regime → {output.regime.value}（手動 override：{output.active_strategy}）"
                    )
                else:
                    msg = f"Regime → {output.regime.value}；策略切換為 {output.active_strategy}"
                self._emit(
                    EventLevel.REGIME,
                    msg,
                    timestamp=bar.timestamp,
                    regime=output.regime.value,
                    strategy=output.active_strategy,
                    note=output.snapshot.note,
                )

            if output.force_flatten:
                self._panic_flatten(bar)

            if output.signal is not None and output.signal.action != SignalAction.HOLD:
                self._execute_signal(output.signal, bar)

            self._update_drawdown()
            return output

    # ------------------------------------------------------------------ #
    # Signal → Order
    # ------------------------------------------------------------------ #
    def _execute_signal(self, signal: Signal, bar: Bar) -> None:
        action = signal.action
        symbol = signal.symbol
        price = signal.price

        try:
            pos = self.broker.get_position(symbol)

            if action == SignalAction.BUY:
                if pos.side == PositionSide.SHORT and pos.is_open:
                    self._close(symbol, price, bar.timestamp, reason="flip from SHORT")
                if not pos.is_open or pos.side == PositionSide.LONG:
                    self._open(
                        symbol, PositionSide.LONG, price, bar.timestamp, signal=signal
                    )

            elif action == SignalAction.SELL:
                if pos.side == PositionSide.LONG and pos.is_open:
                    self._close(symbol, price, bar.timestamp, reason="flip from LONG")
                if not pos.is_open or pos.side == PositionSide.SHORT:
                    self._open(
                        symbol, PositionSide.SHORT, price, bar.timestamp, signal=signal
                    )

            elif action == SignalAction.CLOSE_LONG and pos.side == PositionSide.LONG and pos.is_open:
                self._close(symbol, price, bar.timestamp, reason=signal.reason)

            elif action == SignalAction.CLOSE_SHORT and pos.side == PositionSide.SHORT and pos.is_open:
                self._close(symbol, price, bar.timestamp, reason=signal.reason)

        except (InsufficientBalanceError, InvalidOrderError) as exc:
            self._emit(
                EventLevel.ERROR,
                f"訂單被拒：{exc}",
                timestamp=bar.timestamp,
                action=action.value,
                price=str(price),
            )

    def _open(
        self,
        symbol: str,
        side: PositionSide,
        price: Decimal,
        timestamp: datetime,
        signal: Optional[Signal] = None,
    ) -> None:
        equity = self.broker.equity({symbol: price})
        # 名目倉位 = equity * fraction * leverage
        notional = equity * self.position_fraction * Decimal(self.leverage)
        qty = (notional / price).quantize(Decimal("0.000001"))
        if qty <= 0:
            self._emit(
                EventLevel.ERROR,
                f"計算出的下單量過小: equity={equity:.2f}, qty={qty}",
                timestamp=timestamp,
            )
            return

        # 用 signal.quantity 覆寫（若策略明確指定）
        if signal and signal.quantity is not None and signal.quantity > 0:
            qty = signal.quantity

        trade = self.broker.open_position(
            symbol=symbol,
            side=side,
            price=price,
            quantity=qty,
            timestamp=timestamp,
            leverage=self.leverage,
        )
        self._emit_trade(trade, signal=signal, kind="OPEN")
        self._notify_strategies(trade)

    def _close(
        self,
        symbol: str,
        price: Decimal,
        timestamp: datetime,
        reason: str = "",
    ) -> None:
        trade = self.broker.close_position(
            symbol=symbol, price=price, timestamp=timestamp
        )
        self._emit_trade(trade, kind="CLOSE", reason=reason)
        self._notify_strategies(trade)

    def _panic_flatten(self, bar: Bar) -> None:
        pos = self.broker.get_position(self.symbol)
        if pos.is_open:
            try:
                self._close(self.symbol, bar.close, bar.timestamp, reason="PANIC FLAT")
                self._emit(
                    EventLevel.PANIC,
                    "黑天鵝偵測：強制平倉並進入觀望",
                    timestamp=bar.timestamp,
                )
            except InvalidOrderError as exc:
                self._emit(
                    EventLevel.ERROR,
                    f"Panic flatten 失敗：{exc}",
                    timestamp=bar.timestamp,
                )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _emit_trade(
        self,
        trade: Trade,
        signal: Optional[Signal] = None,
        kind: str = "TRADE",
        reason: str = "",
    ) -> None:
        side_str = trade.side.value
        msg = (
            f"{kind} {side_str} {trade.quantity} {trade.symbol} @ {trade.price} "
            f"(fee={trade.fee:.4f}"
        )
        if trade.realized_pnl != 0:
            msg += f", PnL={trade.realized_pnl:.2f}"
        msg += ")"
        if reason:
            msg += f" — {reason}"
        elif signal and signal.reason:
            msg += f" — {signal.reason}"
        self._emit(
            EventLevel.TRADE,
            msg,
            timestamp=trade.timestamp,
            symbol=trade.symbol,
            side=side_str,
            price=str(trade.price),
            quantity=str(trade.quantity),
            realized_pnl=str(trade.realized_pnl),
        )

    def _notify_strategies(self, trade: Trade) -> None:
        for strat in self.strategy_manager.all_strategies:
            try:
                strat.on_order_filled(trade)
            except Exception:  # noqa: BLE001
                pass

    def _update_drawdown(self) -> None:
        if self.last_price is None:
            return
        equity = self.broker.equity({self.symbol: self.last_price})
        if equity > self._equity_peak:
            self._equity_peak = equity
        if self._equity_peak > 0:
            dd = (self._equity_peak - equity) / self._equity_peak
            if dd > self._max_drawdown:
                self._max_drawdown = dd

    # ------------------------------------------------------------------ #
    # 對外 API（被 Web 端 / CLI 端呼叫；皆為 thread-safe）
    # ------------------------------------------------------------------ #
    def list_strategies(self) -> Dict[str, Any]:
        with self._lock:
            return self.strategy_manager.list_describe()

    def set_active_strategy(self, name: Optional[str]) -> Dict[str, Any]:
        """`name=None` 表示釋放手動 override，回到 regime 自動切換。"""
        with self._lock:
            old_active = self.strategy_manager.active_strategy.name
            result = self.strategy_manager.set_override(name)
            new_active = self.strategy_manager.active_strategy.name
            if name is None:
                self._emit(
                    EventLevel.REGIME,
                    f"[Manual] 釋放 override；回到 regime 自動切換（current={new_active}）",
                )
            else:
                self._emit(
                    EventLevel.REGIME,
                    f"[Manual] 強制啟用策略：{old_active} → {new_active}",
                )
            return result

    def update_strategy_params(
        self, name: str, new_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        with self._lock:
            result = self.strategy_manager.update_params(name, new_params)
            self._emit(
                EventLevel.INFO,
                f"[Params] {name} 已更新：{', '.join(f'{k}={v}' for k, v in new_params.items())}",
            )
            return result

    def state_snapshot(self) -> dict:
        with self._lock:
            return self._state_snapshot_unlocked()

    def _state_snapshot_unlocked(self) -> dict:
        mark = {self.symbol: self.last_price} if self.last_price else {}
        snap = self.broker.snapshot(mark)
        equity = self.broker.equity(mark)
        current_dd = (
            (self._equity_peak - equity) / self._equity_peak
            if self._equity_peak > 0
            else Decimal("0")
        )
        return {
            "symbol": self.symbol,
            "last_price": self.last_price,
            "regime": (
                self.last_regime_output.regime.value
                if self.last_regime_output
                else "UNKNOWN"
            ),
            "active_strategy": (
                self.last_regime_output.active_strategy
                if self.last_regime_output
                else "-"
            ),
            "regime_note": (
                self.last_regime_output.snapshot.note
                if self.last_regime_output
                else ""
            ),
            "indicators": {
                "adx": self.last_regime_output.snapshot.adx
                if self.last_regime_output
                else None,
                "atr": self.last_regime_output.snapshot.atr
                if self.last_regime_output
                else None,
                "atr_pct": self.last_regime_output.snapshot.atr_percentile
                if self.last_regime_output
                else None,
                "rsi": self.last_regime_output.snapshot.rsi
                if self.last_regime_output
                else None,
            },
            "account": snap,
            "equity_peak": self._equity_peak,
            "current_drawdown": current_dd,
            "max_drawdown": self._max_drawdown,
            "strategies": self.strategy_manager.list_describe(),
        }
