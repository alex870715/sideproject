"""Pump Bot 歷史回測：拉 OKX 公開 K 線 → 重播 PumpEngine → 輸出績效報告。

用法（CLI）：
    python main.py --pump --backtest --days 7 --universe-size 10

設計：
- `HistoricalMultiMarket`：預載各 symbol 的 1m K 線，按時間同步推進。
- `SimMultiBroker`：本地模擬 OKXMultiBroker 介面（保證金 / 合約張數 / 槓桿）。
- 固定 universe（回測期間不刷新 scanner），避免 look-ahead bias 的複雜度。
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.account import (
    Account,
    InsufficientBalanceError,
    InvalidOrderError,
    OrderSide,
    Position,
    PositionSide,
    Trade,
)
from core.engine import Event, EventLevel
from core.okx_client import OKXClient
from core.okx_market import _parse_candle
from core.okx_multi_broker import InstrumentSpec, ZERO
from core.pump_engine import PumpEngine
from core.scanner import Scanner, UniverseItem
from strategies.base_strategy import Bar


_BAR_SECONDS = {"1m": 60, "3m": 180, "5m": 300, "15m": 900, "1H": 3600}


@dataclass
class BacktestConfig:
    days: int = 7
    bar: str = "1m"
    universe_size: int = 10
    warmup_bars: int = 120
    initial_balance: Decimal = Decimal("10000")
    strategy: str = "VolumeBreakout"
    risk_mode: str = "aggressive_long"
    include_majors: bool = True
    taker_fee_rate: Decimal = Decimal("0.0005")
    output_dir: str = "data/backtest"


@dataclass
class BacktestResult:
    config: BacktestConfig
    universe: List[str]
    start_ts: datetime
    end_ts: datetime
    bars_simulated: int
    initial_equity: Decimal
    final_equity: Decimal
    return_pct: Decimal
    total_trades: int
    wins: int
    losses: int
    total_fee: Decimal
    realized_pnl: Decimal
    max_drawdown_pct: Decimal
    equity_curve: List[Tuple[str, float]] = field(default_factory=list)
    trades: List[Dict[str, Any]] = field(default_factory=list)
    events_sample: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------- #
# Historical market replay
# ---------------------------------------------------------------------- #
class HistoricalMultiMarket:
    """預載 K 線並按「全局時間軸」同步推進。"""

    def __init__(
        self,
        bars_by_symbol: Dict[str, List[Bar]],
        warmup_bars: int,
        max_history: int = 200,
    ) -> None:
        if not bars_by_symbol:
            raise ValueError("bars_by_symbol is empty")
        self.warmup_count = warmup_bars
        self.max_history = max_history
        self._full: Dict[str, List[Bar]] = bars_by_symbol
        self._bars: Dict[str, List[Bar]] = {}
        self._last_ts: Dict[str, int] = {}
        self._pending: Dict[str, List[Bar]] = {}
        self._timeline: List[int] = self._build_timeline(warmup_bars)
        self._step = 0

    def _build_timeline(self, warmup_bars: int) -> List[int]:
        """取所有 symbol 在 warmup 之後的共同時間戳（聯集）。"""
        ts_set: set[int] = set()
        for bars in self._full.values():
            for b in bars[warmup_bars:]:
                ts_set.add(int(b.timestamp.timestamp() * 1000))
        return sorted(ts_set)

    def bars_of(self, symbol: str) -> List[Bar]:
        return list(self._bars.get(symbol, []))

    def last_close(self, symbol: str) -> Optional[Decimal]:
        bars = self._bars.get(symbol)
        return bars[-1].close if bars else None

    def warmup(self, symbol: str) -> List[Bar]:
        full = self._full.get(symbol, [])
        init = full[: self.warmup_count]
        self._bars[symbol] = list(init)
        if init:
            self._last_ts[symbol] = int(init[-1].timestamp.timestamp() * 1000)
        return init

    def drop(self, symbol: str) -> None:
        self._bars.pop(symbol, None)
        self._last_ts.pop(symbol, None)

    def advance_step(self) -> bool:
        """推進到下一個全局時間點；回傳 False 表示回測結束。"""
        if self._step >= len(self._timeline):
            return False
        ts_ms = self._timeline[self._step]
        self._pending.clear()
        ts_dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
        for sym, full in self._full.items():
            for b in full:
                if int(b.timestamp.timestamp() * 1000) == ts_ms:
                    self._pending[sym] = [b]
                    break
        self._step += 1
        return True

    @property
    def current_time(self) -> Optional[datetime]:
        if self._step == 0:
            return None
        idx = min(self._step - 1, len(self._timeline) - 1)
        if idx < 0:
            return None
        return datetime.fromtimestamp(self._timeline[idx] / 1000.0, tz=timezone.utc)

    def fetch_new_bars(self, symbol: str) -> List[Bar]:
        new = self._pending.pop(symbol, [])
        if not new:
            return []
        buf = self._bars.setdefault(symbol, [])
        buf.extend(new)
        if len(buf) > self.max_history:
            self._bars[symbol] = buf[-self.max_history :]
        self._last_ts[symbol] = int(new[-1].timestamp.timestamp() * 1000)
        return new

    @property
    def steps_total(self) -> int:
        return len(self._timeline)

    @property
    def steps_done(self) -> int:
        return self._step


# ---------------------------------------------------------------------- #
# Simulated multi-symbol broker
# ---------------------------------------------------------------------- #
class SimMultiBroker:
    """本地模擬 broker，介面對齊 OKXMultiBroker（PumpEngine 所需 subset）。"""

    def __init__(
        self,
        specs: Dict[str, InstrumentSpec],
        initial_balance: Decimal = Decimal("10000"),
        taker_fee_rate: Decimal = Decimal("0.0005"),
        margin_ccy: str = "USDT",
    ) -> None:
        self._account = Account(initial_balance=initial_balance, taker_fee_rate=taker_fee_rate)
        self._spec_cache = dict(specs)
        self.margin_ccy = margin_ccy
        self.pos_mode = "net_mode"
        self._lever_cache: Dict[str, int] = {}
        self._used_margin: Dict[str, Decimal] = {}
        self._td_mode_by_symbol: Dict[str, str] = {}
        self._mark_prices: Dict[str, Decimal] = {}
        self._initial_equity = initial_balance

    def preload_instruments(self, symbols: List[str]) -> None:
        pass

    def ensure_instrument(self, symbol: str) -> InstrumentSpec:
        if symbol not in self._spec_cache:
            raise InvalidOrderError(f"unknown instrument: {symbol}")
        return self._spec_cache[symbol]

    def set_leverage(
        self,
        symbol: str,
        lever: int,
        td_mode: Optional[str] = None,
        pos_side: Optional[str] = None,
    ) -> int:
        spec = self.ensure_instrument(symbol)
        target = max(1, min(lever, spec.max_lever))
        self._lever_cache[symbol] = target
        return target

    def refresh_state(self) -> None:
        self._sync_positions_from_account()

    def _sync_positions_from_account(self) -> None:
        pass  # positions 直接讀 account

    @property
    def equity(self) -> Decimal:
        base = self._account.balance
        for sym, pos in self._account.positions.items():
            if not pos.is_open:
                continue
            mark = self._mark_prices.get(sym, pos.avg_entry_price)
            if self._td_mode_by_symbol.get(sym) == "isolated":
                margin = self._used_margin.get(sym, ZERO)
                upl = pos.unrealized_pnl(mark)
                base += margin + max(-margin, upl)
            else:
                base += pos.unrealized_pnl(mark)
        return base

    @property
    def initial_equity(self) -> Decimal:
        return self._initial_equity

    def update_marks(self, marks: Dict[str, Decimal]) -> None:
        self._mark_prices.update(marks)

    def margin_available(self, ccy: Optional[str] = None) -> Decimal:
        if ccy and ccy != self.margin_ccy:
            return ZERO
        cross_used = sum(
            m for sym, m in self._used_margin.items()
            if self._td_mode_by_symbol.get(sym) != "isolated"
        )
        return max(ZERO, self._account.balance - cross_used)

    def margin_block_reason(self, ccy: Optional[str] = None) -> str:
        if self.margin_available(ccy) <= ZERO:
            return f"{ccy or self.margin_ccy} 可用保證金為 0"
        return ""

    def check_isolated_liquidations(self) -> None:
        """逐倉：未實現虧損 ≥ 鎖定保證金時強平（最多只賠該筆保證金）。"""
        for sym, pos in list(self._account.positions.items()):
            if not pos.is_open:
                continue
            if self._td_mode_by_symbol.get(sym) != "isolated":
                continue
            margin = self._used_margin.get(sym, ZERO)
            if margin <= ZERO:
                continue
            mark = self._mark_prices.get(sym)
            if mark is None:
                continue
            upl = pos.unrealized_pnl(mark)
            if upl <= -margin:
                self._close_isolated(sym, mark, cap_loss=-margin)

    def _close_isolated(self, symbol: str, price: Decimal, cap_loss: Decimal) -> None:
        pos = self.get_position(symbol)
        if not pos.is_open:
            return
        margin = self._used_margin.pop(symbol, ZERO)
        self._td_mode_by_symbol.pop(symbol, None)
        raw_pnl = pos.unrealized_pnl(price)
        pnl = max(cap_loss, raw_pnl)
        fee_rate = self._account.taker_fee_rate
        fee = price * pos.quantity * fee_rate
        self._account.balance += margin + pnl - fee
        self._account.realized_pnl += pnl
        self._account.total_fee_paid += fee
        side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
        self._account.trades.append(
            Trade(
                timestamp=datetime.now(timezone.utc),
                symbol=symbol,
                side=side,
                price=price,
                quantity=pos.quantity,
                fee=fee,
                realized_pnl=pnl,
            )
        )
        pos.side = PositionSide.FLAT
        pos.quantity = ZERO
        pos.avg_entry_price = ZERO

    def get_position(self, symbol: str) -> Position:
        return self._account.get_position(symbol)

    def all_positions(self) -> Dict[str, Position]:
        return {
            sym: pos for sym, pos in self._account.positions.items() if pos.is_open
        }

    def open_long(
        self,
        symbol: str,
        notional_usdt: Decimal,
        ref_price: Decimal,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
    ) -> Trade:
        spec = self.ensure_instrument(symbol)
        lever = self._lever_cache.get(symbol, 1)
        if ref_price <= 0:
            raise InvalidOrderError(f"ref_price must be > 0")
        qty_coin = notional_usdt / ref_price
        contracts = self._coins_to_contracts(qty_coin, spec)
        if contracts <= 0:
            raise InvalidOrderError(
                f"notional {notional_usdt} too small for {symbol}"
            )
        if spec.max_mkt_size and contracts > spec.max_mkt_size:
            contracts = self._floor_to_lot(spec.max_mkt_size, spec.lot_size)
        filled_qty = contracts * spec.ct_val
        margin_needed = notional_usdt / Decimal(lever)
        mgn_mode = td_mode or "isolated"
        if mgn_mode == "isolated":
            if margin_needed + (notional_usdt * self._account.taker_fee_rate) > self._account.balance:
                raise InsufficientBalanceError(
                    f"need margin {margin_needed}, avail {self._account.balance}"
                )
        elif margin_needed > self.margin_available():
            raise InsufficientBalanceError(
                f"need margin {margin_needed}, avail {self.margin_available()}"
            )
        trade = self._account.open_position(
            symbol=symbol,
            side=PositionSide.LONG,
            price=ref_price,
            quantity=filled_qty,
            timestamp=timestamp,
            leverage=lever,
        )
        self._used_margin[symbol] = margin_needed
        self._td_mode_by_symbol[symbol] = mgn_mode
        if mgn_mode == "isolated":
            self._account.balance -= margin_needed
        return trade

    def open_short(
        self,
        symbol: str,
        notional_usdt: Decimal,
        ref_price: Decimal,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
    ) -> Trade:
        spec = self.ensure_instrument(symbol)
        lever = self._lever_cache.get(symbol, 1)
        if ref_price <= 0:
            raise InvalidOrderError(f"ref_price must be > 0")
        qty_coin = notional_usdt / ref_price
        contracts = self._coins_to_contracts(qty_coin, spec)
        if contracts <= 0:
            raise InvalidOrderError(f"notional {notional_usdt} too small for {symbol}")
        if spec.max_mkt_size and contracts > spec.max_mkt_size:
            contracts = self._floor_to_lot(spec.max_mkt_size, spec.lot_size)
        filled_qty = contracts * spec.ct_val
        margin_needed = notional_usdt / Decimal(lever)
        mgn_mode = td_mode or "isolated"
        if mgn_mode == "isolated":
            if margin_needed + (notional_usdt * self._account.taker_fee_rate) > self._account.balance:
                raise InsufficientBalanceError(
                    f"need margin {margin_needed}, avail {self._account.balance}"
                )
        elif margin_needed > self.margin_available():
            raise InsufficientBalanceError(
                f"need margin {margin_needed}, avail {self.margin_available()}"
            )
        trade = self._account.open_position(
            symbol=symbol,
            side=PositionSide.SHORT,
            price=ref_price,
            quantity=filled_qty,
            timestamp=timestamp,
            leverage=lever,
        )
        self._used_margin[symbol] = margin_needed
        self._td_mode_by_symbol[symbol] = mgn_mode
        if mgn_mode == "isolated":
            self._account.balance -= margin_needed
        return trade

    def close_position(
        self,
        symbol: str,
        timestamp: Optional[datetime] = None,
        td_mode: Optional[str] = None,
    ) -> Trade:
        pos = self.get_position(symbol)
        if not pos.is_open:
            raise InvalidOrderError(f"No open position for {symbol}")
        mark = self._mark_prices.get(symbol, pos.avg_entry_price)
        mgn_mode = td_mode or self._td_mode_by_symbol.get(symbol, "isolated")
        margin = self._used_margin.pop(symbol, ZERO)
        self._td_mode_by_symbol.pop(symbol, None)
        if mgn_mode == "isolated" and margin > ZERO:
            raw_pnl = pos.unrealized_pnl(mark)
            pnl = max(-margin, raw_pnl)
            fee_rate = self._account.taker_fee_rate
            fee = mark * pos.quantity * fee_rate
            self._account.balance += margin + pnl - fee
            self._account.realized_pnl += pnl
            self._account.total_fee_paid += fee
            side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            trade = Trade(
                timestamp=timestamp or datetime.now(timezone.utc),
                symbol=symbol,
                side=side,
                price=mark,
                quantity=pos.quantity,
                fee=fee,
                realized_pnl=pnl,
            )
            self._account.trades.append(trade)
            pos.side = PositionSide.FLAT
            pos.quantity = ZERO
            pos.avg_entry_price = ZERO
            return trade
        trade = self._account.close_position(
            symbol=symbol,
            price=mark,
            timestamp=timestamp,
        )
        return trade

    def snapshot(self, mark_prices: Optional[Dict[str, Decimal]] = None) -> dict:
        marks = mark_prices or self._mark_prices
        snap = self._account.snapshot(marks)
        snap["equity"] = self._account.equity(marks)
        snap["return_pct"] = self._account.return_pct(marks)
        return snap

    @staticmethod
    def _floor_to_lot(value: Decimal, lot_size: Decimal) -> Decimal:
        if lot_size <= 0:
            return value
        return (value / lot_size).quantize(Decimal("1"), rounding=ROUND_DOWN) * lot_size

    def _coins_to_contracts(self, qty_coin: Decimal, spec: InstrumentSpec) -> Decimal:
        if qty_coin <= 0 or spec.ct_val <= 0:
            return ZERO
        contracts = qty_coin / spec.ct_val
        return self._floor_to_lot(contracts, spec.lot_size)


class FixedUniverseScanner:
    """回測用：universe 固定，refresh 直接回傳初始列表。"""

    def __init__(self, universe: List[UniverseItem]) -> None:
        self._universe = universe

    def refresh_universe(self) -> List[UniverseItem]:
        return list(self._universe)


# ---------------------------------------------------------------------- #
# Data loading
# ---------------------------------------------------------------------- #
def _bars_per_day(bar: str) -> int:
    sec = _BAR_SECONDS.get(bar, 60)
    return 86400 // sec


def load_historical_bars(
    client: OKXClient,
    symbols: List[str],
    bar: str,
    days: int,
    warmup_bars: int,
    on_progress: Optional[Any] = None,
) -> Dict[str, List[Bar]]:
    total_needed = days * _bars_per_day(bar) + warmup_bars
    result: Dict[str, List[Bar]] = {}
    for i, sym in enumerate(symbols):
        if on_progress:
            on_progress(f"[{i+1}/{len(symbols)}] 下載 {sym} …")
        rows = client.fetch_candles_range(sym, bar=bar, total_bars=total_needed)
        bars = [_parse_candle(r, sym) for r in rows]
        if len(bars) < warmup_bars + 10:
            if on_progress:
                on_progress(f"  跳過 {sym}（僅 {len(bars)} 根 bar）")
            continue
        result[sym] = bars
        time.sleep(0.1)
    return result


def build_universe(client: OKXClient, top_n: int, include_majors: bool = True) -> List[UniverseItem]:
    scanner = Scanner(client, top_n=top_n, include_majors=include_majors)
    return scanner.refresh_universe()


def load_instrument_specs(
    client: OKXClient, symbols: List[str]
) -> Dict[str, InstrumentSpec]:
    specs: Dict[str, InstrumentSpec] = {}
    all_raw = client.list_instruments(inst_type="SWAP")
    wanted = set(symbols)
    for raw in all_raw:
        inst_id = raw.get("instId", "")
        if inst_id in wanted:
            specs[inst_id] = InstrumentSpec(raw)
    return specs


# ---------------------------------------------------------------------- #
# Runner
# ---------------------------------------------------------------------- #
def run_pump_backtest(
    config: BacktestConfig,
    client: Optional[OKXClient] = None,
    verbose: bool = True,
) -> BacktestResult:
    def log(msg: str) -> None:
        if verbose:
            print(msg)

    if client is None:
        api_key = os.getenv("OKX_API_KEY", "").strip()
        api_secret = os.getenv("OKX_API_SECRET", "").strip()
        passphrase = os.getenv("OKX_PASSPHRASE", "").strip()
        if not api_key:
            raise SystemExit("回測需 OKX API（僅拉公開 K 線）。請設定 .env")
        client = OKXClient(api_key, api_secret, passphrase, demo=True)

    log(f"\n{'='*60}")
    log(f"  Pump Bot 回測 — 近 {config.days} 天 · {config.bar} · top {config.universe_size}")
    log(f"  策略: {config.strategy} · 風險模式: {config.risk_mode}")
    log(f"{'='*60}\n")

    log("① 取得 universe（大幣 pin + 高成交量小幣）…")
    universe_items = build_universe(client, config.universe_size, config.include_majors)
    if not universe_items:
        raise SystemExit("universe 為空，無法回測")
    symbols = [u.inst_id for u in universe_items]
    log(f"   {len(symbols)} symbols: {', '.join(symbols[:5])}{'…' if len(symbols)>5 else ''}")

    log("\n② 下載歷史 K 線（可能需要 1~3 分鐘）…")
    bars_map = load_historical_bars(
        client, symbols, config.bar, config.days, config.warmup_bars, on_progress=log
    )
    if not bars_map:
        raise SystemExit("無法下載任何 K 線")
    active_symbols = list(bars_map.keys())
    log(f"   有效 symbol: {len(active_symbols)}")

    log("\n③ 載入合約規格…")
    specs = load_instrument_specs(client, active_symbols)

    log("\n④ 組裝引擎並熱機…")
    broker = SimMultiBroker(
        specs=specs,
        initial_balance=config.initial_balance,
        taker_fee_rate=config.taker_fee_rate,
    )
    market = HistoricalMultiMarket(
        bars_by_symbol=bars_map,
        warmup_bars=config.warmup_bars,
    )
    uni_filtered = [u for u in universe_items if u.inst_id in active_symbols]
    scanner = FixedUniverseScanner(uni_filtered)

    # config.strategy 可用逗號分隔多個策略，回測時同時啟用（與實盤一致）
    strat_names = [s.strip() for s in str(config.strategy).split(",") if s.strip()]
    engine = PumpEngine(
        broker=broker,
        market=market,
        scanner=scanner,
        active_strategy=strat_names[0] if strat_names else "VolumeBreakout",
        risk_mode_key=config.risk_mode,
        bar_interval=config.bar,
        universe_refresh_seconds=10**9,
        candidates_top_k=min(15, len(active_symbols)),
    )
    if len(strat_names) > 1:
        engine.set_active_strategies(strat_names)
    engine.universe_refresh_seconds = 10**9
    engine.live = False
    for u in uni_filtered:
        market.warmup(u.inst_id)
    engine._universe = uni_filtered  # noqa: SLF001
    engine._last_universe_refresh_ts = time.time()  # noqa: SLF001
    engine.live = True

    trade_events: List[str] = []
    equity_curve: List[Tuple[str, float]] = []
    peak_equity = float(config.initial_balance)
    max_dd = 0.0

    log(f"\n⑤ 回測推進（{market.steps_total} 根 bar × {len(active_symbols)} symbols）…")
    step = 0
    report_every = max(1, market.steps_total // 20)

    while market.advance_step():
        broker.check_isolated_liquidations()
        engine.tick()
        step += 1
        marks = {
            sym: market.last_close(sym)
            for sym in active_symbols
            if market.last_close(sym) is not None
        }
        marks_typed = {k: v for k, v in marks.items() if v is not None}
        broker.update_marks(marks_typed)
        broker.check_isolated_liquidations()
        eq = float(broker.equity)
        ts = market.current_time
        ts_str = ts.isoformat() if ts else ""
        equity_curve.append((ts_str, eq))
        if eq > peak_equity:
            peak_equity = eq
        dd = (peak_equity - eq) / peak_equity if peak_equity > 0 else 0.0
        max_dd = max(max_dd, dd)
        if step % report_every == 0:
            pct = step / market.steps_total * 100
            log(f"   {pct:5.1f}%  equity={eq:,.2f}  trades={len(broker._account.trades)}")

    # 回測結束：強制平倉
    for sym in list(broker.all_positions().keys()):
        try:
            engine._close_position(sym, reason="backtest end")  # noqa: SLF001
        except Exception:  # noqa: BLE001
            pass

    final_marks = {
        sym: market.last_close(sym) or Decimal("0")
        for sym in active_symbols
    }
    broker.update_marks({k: v for k, v in final_marks.items() if v > 0})
    final_eq = broker.equity

    closes = [t for t in broker._account.trades if t.realized_pnl != 0]
    wins = sum(1 for t in closes if t.realized_pnl > 0)
    losses = sum(1 for t in closes if t.realized_pnl < 0)

    start_ts = datetime.fromtimestamp(
        market._timeline[0] / 1000.0, tz=timezone.utc
    ) if market._timeline else datetime.now(timezone.utc)
    end_ts = market.current_time or datetime.now(timezone.utc)

    result = BacktestResult(
        config=config,
        universe=active_symbols,
        start_ts=start_ts,
        end_ts=end_ts,
        bars_simulated=step,
        initial_equity=config.initial_balance,
        final_equity=final_eq,
        return_pct=(final_eq - config.initial_balance) / config.initial_balance,
        total_trades=len(broker._account.trades),
        wins=wins,
        losses=losses,
        total_fee=broker._account.total_fee_paid,
        realized_pnl=broker._account.realized_pnl,
        max_drawdown_pct=Decimal(str(round(max_dd * 100, 2))),
        equity_curve=equity_curve,
        trades=[
            {
                "timestamp": t.timestamp.isoformat(),
                "symbol": t.symbol,
                "side": t.side.value,
                "price": str(t.price),
                "quantity": str(t.quantity),
                "fee": str(t.fee),
                "realized_pnl": str(t.realized_pnl),
            }
            for t in broker._account.trades
        ],
        events_sample=trade_events,
    )

    _print_report(result, log)
    _save_report(result, config.output_dir)
    return result


def _print_report(r: BacktestResult, log: Any) -> None:
    win_rate = (r.wins / (r.wins + r.losses) * 100) if (r.wins + r.losses) else 0.0
    log(f"\n{'='*60}")
    log("  回測結果")
    log(f"{'='*60}")
    log(f"  期間        : {r.start_ts:%Y-%m-%d %H:%M} → {r.end_ts:%Y-%m-%d %H:%M} UTC")
    log(f"  模擬 bar 數  : {r.bars_simulated:,}")
    log(f"  Universe    : {len(r.universe)} symbols")
    log(f"  初始資金    : {r.initial_equity:,.2f} USDT")
    log(f"  最終權益    : {r.final_equity:,.2f} USDT")
    log(f"  收益率      : {float(r.return_pct)*100:+.2f}%")
    log(f"  最大回撤    : {r.max_drawdown_pct}%")
    log(f"  成交筆數    : {r.total_trades}（平倉 {r.wins+r.losses}：勝 {r.wins} / 負 {r.losses}，勝率 {win_rate:.1f}%）")
    log(f"  已實現損益  : {r.realized_pnl:+,.2f} USDT")
    log(f"  累計手續費  : {r.total_fee:,.4f} USDT")
    log(f"{'='*60}\n")

    closes = [t for t in r.trades if t["realized_pnl"] != "0"]
    if closes:
        log("  最近 10 筆平倉：")
        for t in closes[-10:]:
            log(
                f"    {t['timestamp'][:16]}  {t['symbol']:20s}  "
                f"PnL={Decimal(t['realized_pnl']):+8.2f}  @ {t['price']}"
            )
        log("")


def _save_report(r: BacktestResult, output_dir: str) -> Path:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = out / f"pump_backtest_{stamp}.json"
    payload = {
        "config": {
            "days": r.config.days,
            "bar": r.config.bar,
            "universe_size": r.config.universe_size,
            "strategy": r.config.strategy,
            "risk_mode": r.config.risk_mode,
            "include_majors": r.config.include_majors,
            "initial_balance": str(r.config.initial_balance),
        },
        "summary": {
            "start_ts": r.start_ts.isoformat(),
            "end_ts": r.end_ts.isoformat(),
            "bars_simulated": r.bars_simulated,
            "initial_equity": str(r.initial_equity),
            "final_equity": str(r.final_equity),
            "return_pct": str(r.return_pct),
            "max_drawdown_pct": str(r.max_drawdown_pct),
            "total_trades": r.total_trades,
            "wins": r.wins,
            "losses": r.losses,
            "realized_pnl": str(r.realized_pnl),
            "total_fee": str(r.total_fee),
        },
        "universe": r.universe,
        "trades": r.trades,
        "equity_curve": r.equity_curve[-500:],
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  報告已存：{path}")
    return path
