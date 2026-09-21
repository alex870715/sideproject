#!/usr/bin/env python3
"""2 日回測：比較 aggressive_long_short 風險參數變體（共用 K 線，只跑一次下載）。"""

from __future__ import annotations

import os
import sys
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from core import risk_mode as rm_mod
from core.okx_client import OKXClient
from core.pump_backtest import (
    BacktestConfig,
    FixedUniverseScanner,
    HistoricalMultiMarket,
    SimMultiBroker,
    build_universe,
    load_historical_bars,
    load_instrument_specs,
)
from core.pump_engine import PumpEngine
import time


def run_variant(
    label: str,
    mode_key: str,
    market: HistoricalMultiMarket,
    bars_map: dict,
    uni_filtered: list,
    specs: dict,
    strat_names: list[str],
) -> dict:
    mode = rm_mod.get(mode_key)
    rm_mod.REGISTRY[mode_key] = mode

    broker = SimMultiBroker(
        specs=specs,
        initial_balance=Decimal("10000"),
        taker_fee_rate=Decimal("0.0005"),
    )
    scanner = FixedUniverseScanner(uni_filtered)
    engine = PumpEngine(
        broker=broker,
        market=market,
        scanner=scanner,
        active_strategy=strat_names[0],
        risk_mode_key=mode_key,
        bar_interval="1m",
        universe_refresh_seconds=10**9,
        candidates_top_k=min(15, len(bars_map)),
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

    active_symbols = list(bars_map.keys())
    peak = 10000.0
    max_dd = 0.0
    while market.advance_step():
        engine.tick()
        marks = {
            sym: market.last_close(sym)
            for sym in active_symbols
            if market.last_close(sym) is not None
        }
        broker.update_marks({k: v for k, v in marks.items() if v is not None})
        eq = float(broker.equity)
        if eq > peak:
            peak = eq
        max_dd = max(max_dd, (peak - eq) / peak if peak else 0.0)

    for sym in list(broker.all_positions().keys()):
        try:
            engine._close_position(sym, reason="sweep end")  # noqa: SLF001
        except Exception:  # noqa: BLE001
            pass

    closes = [t for t in broker._account.trades if t.realized_pnl != 0]
    wins = sum(1 for t in closes if t.realized_pnl > 0)
    losses = sum(1 for t in closes if t.realized_pnl < 0)
    final = float(broker.equity)
    return {
        "label": label,
        "return_pct": (final - 10000) / 10000 * 100,
        "max_dd": max_dd * 100,
        "trades": len(broker._account.trades),
        "closes": len(closes),
        "win_rate": wins / (wins + losses) * 100 if (wins + losses) else 0,
        "pnl": float(broker._account.realized_pnl),
        "fee": float(broker._account.total_fee_paid),
        "net": float(broker._account.realized_pnl - broker._account.total_fee_paid),
    }


def main() -> None:
    api_key = os.getenv("OKX_API_KEY", "").strip()
    api_secret = os.getenv("OKX_API_SECRET", "").strip()
    passphrase = os.getenv("OKX_PASSPHRASE", "").strip()
    if not api_key:
        raise SystemExit("需要 .env OKX API")

    client = OKXClient(api_key, api_secret, passphrase, demo=True)
    cfg = BacktestConfig(days=2, universe_size=30, strategy="VolumeBreakout,MomentumIgnition")
    strat_names = [s.strip() for s in cfg.strategy.split(",") if s.strip()]

    print("下載 universe + K 線…")
    universe_items = build_universe(client, cfg.universe_size, cfg.include_majors)
    symbols = [u.inst_id for u in universe_items]
    bars_map = load_historical_bars(client, symbols, cfg.bar, cfg.days, cfg.warmup_bars)
    uni_filtered = [u for u in universe_items if u.inst_id in bars_map]
    specs = load_instrument_specs(client, list(bars_map.keys()))
    print(f"  {len(bars_map)} symbols, {len(list(bars_map.values())[0])} bars/symbol\n")

    base = rm_mod.get("aggressive_long_short")
    variants = [
        ("A 基線（多空同參、含大幣空）", replace(
            base,
            short_stop_atr_mult=0.0,
            short_take_profit_r=0.0,
            short_max_hold_bars=0,
            short_exclude_majors=False,
        )),
        ("B 大幣不做空", replace(
            base,
            short_stop_atr_mult=0.0,
            short_take_profit_r=0.0,
            short_max_hold_bars=0,
            short_exclude_majors=True,
        )),
        ("C 大幣不做空 + 空單緊止損", replace(
            base,
            short_stop_atr_mult=1.5,
            short_take_profit_r=2.0,
            short_max_hold_bars=30,
            short_exclude_majors=True,
        )),
        ("D 空單緊止損（含大幣空）", replace(
            base,
            short_stop_atr_mult=1.5,
            short_take_profit_r=2.0,
            short_max_hold_bars=30,
            short_exclude_majors=False,
        )),
    ]

    results = []
    for label, mode in variants:
        rm_mod.REGISTRY["aggressive_long_short"] = mode
        market = HistoricalMultiMarket(bars_by_symbol=bars_map, warmup_bars=cfg.warmup_bars)
        r = run_variant(label, "aggressive_long_short", market, bars_map, uni_filtered, specs, strat_names)
        results.append(r)
        print(f"{label}")
        print(f"  收益 {r['return_pct']:+.2f}%  DD {r['max_dd']:.2f}%  "
              f"成交 {r['trades']}  勝率 {r['win_rate']:.1f}%  "
              f"PnL {r['pnl']:+.0f}  費 {r['fee']:.0f}  淨 {r['net']:+.0f}\n")

    best = max(results, key=lambda x: x["return_pct"])
    print(f"最佳：{best['label']} ({best['return_pct']:+.2f}%)")


if __name__ == "__main__":
    main()
