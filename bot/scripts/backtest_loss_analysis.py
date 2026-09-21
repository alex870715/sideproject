#!/usr/bin/env python3
"""7 日回測：找出 5000 USDT 虧光的主因（全倉 vs 逐倉、策略數、多空）。"""

from __future__ import annotations

import os
import sys
import time
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

ALL5 = (
    "VolumeBreakout,MomentumIgnition,RisingFlag,VolumeSurge,HigherLow"
)
PAIR2 = "VolumeBreakout,MomentumIgnition"
INITIAL = Decimal("5000")


def run_case(
    label: str,
    mode: rm_mod.RiskMode,
    strategies: str,
    market: HistoricalMultiMarket,
    bars_map: dict,
    uni_filtered: list,
    specs: dict,
) -> dict:
    key = f"_tmp_{mode.key}"
    rm_mod.REGISTRY[key] = mode
    strat_names = [s.strip() for s in strategies.split(",") if s.strip()]

    broker = SimMultiBroker(
        specs=specs,
        initial_balance=INITIAL,
        taker_fee_rate=Decimal("0.0005"),
    )
    scanner = FixedUniverseScanner(uni_filtered)
    engine = PumpEngine(
        broker=broker,
        market=market,
        scanner=scanner,
        active_strategy=strat_names[0],
        risk_mode_key=key,
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
    peak = float(INITIAL)
    max_dd = 0.0
    while market.advance_step():
        broker.check_isolated_liquidations()
        engine.tick()
        marks = {
            sym: market.last_close(sym)
            for sym in active_symbols
            if market.last_close(sym) is not None
        }
        broker.update_marks({k: v for k, v in marks.items() if v is not None})
        broker.check_isolated_liquidations()
        eq = float(broker.equity)
        if eq > peak:
            peak = eq
        max_dd = max(max_dd, (peak - eq) / peak if peak else 0.0)

    for sym in list(broker.all_positions().keys()):
        try:
            engine._close_position(sym, reason="bt end")  # noqa: SLF001
        except Exception:  # noqa: BLE001
            pass

    closes = [t for t in broker._account.trades if t.realized_pnl != 0]
    wins = sum(1 for t in closes if t.realized_pnl > 0)
    losses = sum(1 for t in closes if t.realized_pnl < 0)
    final = float(broker.equity)
    fee = float(broker._account.total_fee_paid)
    pnl = float(broker._account.realized_pnl)
    return {
        "label": label,
        "td_mode": mode.td_mode,
        "leverage": mode.leverage,
        "return_pct": (final - float(INITIAL)) / float(INITIAL) * 100,
        "max_dd": max_dd * 100,
        "trades": len(broker._account.trades),
        "closes": len(closes),
        "win_rate": wins / (wins + losses) * 100 if (wins + losses) else 0,
        "pnl": pnl,
        "fee": fee,
        "net": pnl - fee,
        "final": final,
    }


def main() -> None:
    api_key = os.getenv("OKX_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("需要 .env OKX API")

    client = OKXClient(
        api_key,
        os.getenv("OKX_API_SECRET", ""),
        os.getenv("OKX_PASSPHRASE", ""),
        demo=True,
    )
    cfg = BacktestConfig(days=7, universe_size=15, include_majors=False)
    print(f"下載 7 日 K 線 · top {cfg.universe_size} 小幣 · 初始 {INITIAL} USDT…")
    universe_items = build_universe(client, cfg.universe_size, cfg.include_majors)
    symbols = [u.inst_id for u in universe_items]
    bars_map = load_historical_bars(client, symbols, cfg.bar, cfg.days, cfg.warmup_bars)
    uni_filtered = [u for u in universe_items if u.inst_id in bars_map]
    specs = load_instrument_specs(client, list(bars_map.keys()))
    print(f"  {len(bars_map)} symbols × {len(list(bars_map.values())[0])} bars\n")

    ls = rm_mod.get("aggressive_long_short")
    safe = rm_mod.get("pump_safe")
    maxlev = rm_mod.get("max_leverage")

    cases = [
        (
            "① 5策略+多空+全倉5×（最像實盤災難）",
            replace(ls, td_mode="cross", leverage=5, max_concurrent=3),
            ALL5,
        ),
        (
            "② 5策略+多空+逐倉5×",
            replace(ls, td_mode="isolated", leverage=5, max_concurrent=3),
            ALL5,
        ),
        (
            "③ 2策略+多空+全倉5×",
            replace(ls, td_mode="cross"),
            PAIR2,
        ),
        (
            "④ 2策略+多空+逐倉5×",
            replace(ls, td_mode="isolated"),
            PAIR2,
        ),
        (
            "⑤ pump_safe+逐倉（現行預設）",
            replace(safe, td_mode="isolated"),
            "MomentumIgnition",
        ),
        (
            "⑥ pump_safe+全倉2×",
            replace(safe, td_mode="cross"),
            "MomentumIgnition",
        ),
        (
            "⑦ max_leverage+全倉25×",
            replace(maxlev, td_mode="cross"),
            "MomentumIgnition",
        ),
        (
            "⑧ max_leverage+逐倉10×",
            replace(maxlev, td_mode="isolated", leverage=10),
            "MomentumIgnition",
        ),
    ]

    results = []
    for label, mode, strats in cases:
        market = HistoricalMultiMarket(bars_by_symbol=bars_map, warmup_bars=cfg.warmup_bars)
        r = run_case(label, mode, strats, market, bars_map, uni_filtered, specs)
        results.append(r)
        td = "全" if r["td_mode"] == "cross" else "逐"
        print(
            f"{label}\n"
            f"  {td}倉 {r['leverage']}×  收益 {r['return_pct']:+.2f}%  "
            f"最大回撤 {r['max_dd']:.1f}%  成交 {r['trades']}  "
            f"勝率 {r['win_rate']:.0f}%  手續費 {r['fee']:.0f}  "
            f"淨 {r['net']:+.0f}  結束 {r['final']:.0f}\n"
        )

    worst = min(results, key=lambda x: x["return_pct"])
    best = max(results, key=lambda x: x["net"])
    print("=" * 60)
    print(f"最差：{worst['label']} → {worst['return_pct']:+.2f}%（結束 {worst['final']:.0f} USDT）")
    print(f"最佳淨利：{best['label']} → 淨 {best['net']:+.0f} USDT")
    print("\n結論參考：")
    cross_avg = sum(r["return_pct"] for r in results if r["td_mode"] == "cross") / max(
        1, sum(1 for r in results if r["td_mode"] == "cross")
    )
    iso_avg = sum(r["return_pct"] for r in results if r["td_mode"] == "isolated") / max(
        1, sum(1 for r in results if r["td_mode"] == "isolated")
    )
    print(f"  全倉平均收益 {cross_avg:+.2f}% vs 逐倉平均 {iso_avg:+.2f}%")
    high_trade = max(results, key=lambda x: x["trades"])
    print(f"  成交最多：{high_trade['label']}（{high_trade['trades']} 筆，手續費 {high_trade['fee']:.0f}）")


if __name__ == "__main__":
    main()
