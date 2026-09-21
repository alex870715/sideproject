"""波動率防守策略：ATR Chandelier Trailing Stop。

定位：
- 這支策略「不太主動開倉」，主要負責「在極端行情下保住本金」。
- 進場條件保守：只有在 ATR 處於歷史低中位數、且價格突破近期區間時才入場。
- 一旦持倉，使用 Chandelier Exit：以「近 N 根的最高/最低點」減/加 K 倍 ATR 作為移動止損。
- 偵測到 ATR 飆升至歷史 95 百分位以上時，立即發出 CLOSE 訊號（黑天鵝強制離場）。

由 StrategyManager 在 `MarketRegime.HIGH_VOLATILITY` 時啟用，作為「最後防線」。
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from strategies.base_strategy import (
    Bar,
    BaseStrategy,
    MarketRegime,
    Signal,
    SignalAction,
)
from strategies.indicators import atr as atr_indicator
from strategies.indicators import percentile_rank


class ATRTrailingStopStrategy(BaseStrategy):
    name = "ATRTrailing"
    suitable_regimes = [MarketRegime.HIGH_VOLATILITY]

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        self.atr_period: int = int(self.params.get("atr_period", 14))
        self.atr_mult: float = float(self.params.get("atr_mult", 3.0))
        self.lookback: int = int(self.params.get("lookback", 20))
        self.panic_percentile: float = float(self.params.get("panic_percentile", 0.95))
        self.atr_history: list[float] = []
        self.atr_history_max: int = int(self.params.get("atr_history_max", 200))

        # 內部追蹤
        self._logical_long: Optional[bool] = None
        self._entry_price: Optional[float] = None
        self._trailing_stop: Optional[float] = None

    def _record_atr(self, value: float) -> None:
        self.atr_history.append(value)
        if len(self.atr_history) > self.atr_history_max:
            self.atr_history = self.atr_history[-self.atr_history_max :]

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if len(self.bars) < max(self.atr_period + 1, self.lookback + 1):
            return None

        a = atr_indicator(self.highs, self.lows, self.closes, self.atr_period)
        if a is None:
            return None
        self._record_atr(a)

        close = float(bar.close)
        # ATR 歷史百分位：用過往（不含當前）的歷史去算 target
        rank = percentile_rank(self.atr_history[:-1], a) if len(self.atr_history) > 1 else 0.5

        # ---------------- 黑天鵝：強制離場 ----------------
        if rank >= self.panic_percentile and self._logical_long is not None:
            side = self._logical_long
            self._reset_position_state()
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.CLOSE_LONG if side else SignalAction.CLOSE_SHORT,
                price=bar.close,
                reason=f"PANIC EXIT: ATR percentile={rank:.2%} >= {self.panic_percentile:.0%}",
                meta={"atr": a, "atr_percentile": rank},
            )

        # ---------------- 持倉中：更新 trailing stop ----------------
        if self._logical_long is True:
            highest = max(float(b.high) for b in self.bars[-self.lookback :])
            new_stop = highest - self.atr_mult * a
            self._trailing_stop = max(self._trailing_stop or new_stop, new_stop)
            if close <= self._trailing_stop:
                stop_hit = self._trailing_stop
                self._reset_position_state()
                return Signal(
                    timestamp=bar.timestamp,
                    symbol=bar.symbol,
                    action=SignalAction.CLOSE_LONG,
                    price=bar.close,
                    reason=f"Trailing stop hit @ {stop_hit:.2f}",
                    meta={"atr": a},
                )
            return None

        if self._logical_long is False:
            lowest = min(float(b.low) for b in self.bars[-self.lookback :])
            new_stop = lowest + self.atr_mult * a
            self._trailing_stop = min(self._trailing_stop or new_stop, new_stop)
            if close >= self._trailing_stop:
                stop_hit = self._trailing_stop
                self._reset_position_state()
                return Signal(
                    timestamp=bar.timestamp,
                    symbol=bar.symbol,
                    action=SignalAction.CLOSE_SHORT,
                    price=bar.close,
                    reason=f"Trailing stop hit @ {stop_hit:.2f}",
                    meta={"atr": a},
                )
            return None

        # ---------------- 無倉：保守進場 ----------------
        # 僅在 ATR 不偏高（rank < 0.7）、且突破近 lookback 高/低時入場。
        if rank > 0.7:
            return None

        recent_high = max(float(b.high) for b in self.bars[-self.lookback : -1])
        recent_low = min(float(b.low) for b in self.bars[-self.lookback : -1])

        if close > recent_high:
            self._logical_long = True
            self._entry_price = close
            self._trailing_stop = close - self.atr_mult * a
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.BUY,
                price=bar.close,
                reason=f"Breakout up: close {close:.2f} > {self.lookback}-bar high {recent_high:.2f}",
                meta={"atr": a, "stop": self._trailing_stop},
            )
        if close < recent_low:
            self._logical_long = False
            self._entry_price = close
            self._trailing_stop = close + self.atr_mult * a
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.SELL,
                price=bar.close,
                reason=f"Breakout down: close {close:.2f} < {self.lookback}-bar low {recent_low:.2f}",
                meta={"atr": a, "stop": self._trailing_stop},
            )
        return None

    def _reset_position_state(self) -> None:
        self._logical_long = None
        self._entry_price = None
        self._trailing_stop = None

    def reset(self) -> None:
        super().reset()
        self.atr_history.clear()
        self._reset_position_state()
