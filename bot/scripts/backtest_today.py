#!/usr/bin/env python3
"""今日 1 日回測：對照各策略/風險組合，找出問題與優化方向。"""

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

ALL5 = "VolumeBreakout,MomentumIgnition,RisingFlag,VolumeSurge,HigherLow"
INITIAL = Decimal("5000")
DAYS = 1


def run_case(
    label: str,
    mode: rm_mod.RiskMode,
    strategies: str,
    market: HistoricalMultiMarket,
    bars_map: dict,
    uni_filtered: list,
    specs: dict,
) -> dict:
    key = f"_bt_{mode.key}_{hash(label) & 0xFFFF}"
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
    wins = [t for t in closes if t.realized_pnl > 0]
    losses = [t for t in closes if t.realized_pnl < 0]
    gross_pnl = sum(float(t.realized_pnl) for t in closes)
    fee = float(broker._account.total_fee_paid)
    final = float(broker.equity)
    opens = len([t for t in broker._account.trades if t.realized_pnl == 0])

    return {
        "label": label,
        "strategies": len(strat_names),
        "mode": mode.key,
        "leverage": mode.leverage,
        "return_pct": (final - float(INITIAL)) / float(INITIAL) * 100,
        "max_dd": max_dd * 100,
        "trades": len(broker._account.trades),
        "opens": opens,
        "closes": len(closes),
        "win_rate": len(wins) / len(closes) * 100 if closes else 0,
        "gross_pnl": gross_pnl,
        "fee": fee,
        "fee_pct": fee / float(INITIAL) * 100,
        "net": gross_pnl - fee,
        "avg_win": sum(float(t.realized_pnl) for t in wins) / len(wins) if wins else 0,
        "avg_loss": sum(float(t.realized_pnl) for t in losses) / len(losses) if losses else 0,
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
    cfg = BacktestConfig(days=DAYS, universe_size=15, include_majors=False)
    print(f"{'='*62}")
    print(f"  今日 1 日回測 · {cfg.universe_size} 小幣 · 初始 {INITIAL} USDT · 逐倉")
    print(f"{'='*62}\n")
    print("下載 K 線…")
    universe_items = build_universe(client, cfg.universe_size, cfg.include_majors)
    symbols = [u.inst_id for u in universe_items]
    bars_map = load_historical_bars(client, symbols, cfg.bar, cfg.days, cfg.warmup_bars)
    uni_filtered = [u for u in universe_items if u.inst_id in bars_map]
    specs = load_instrument_specs(client, list(bars_map.keys()))
    n_bars = len(list(bars_map.values())[0]) - cfg.warmup_bars
    print(f"  {len(bars_map)} symbols · 回測 {n_bars} 根 1m bar（約 {n_bars/60:.1f} 小時）\n")

    safe = rm_mod.get("pump_safe")
    agg_l = rm_mod.get("aggressive_long")
    agg_ls = rm_mod.get("aggressive_long_short")

    cases = [
        ("A 現行預設：pump_safe + VolumeBreakout", safe, "VolumeBreakout"),
        ("B pump_safe + 5 策略全開", safe, ALL5),
        ("C aggressive_long + MomentumIgnition", agg_l, "MomentumIgnition"),
        ("D aggressive_long + 5 策略", agg_l, ALL5),
        ("E aggressive L/S + 2 策略", agg_ls, "VolumeBreakout,MomentumIgnition"),
        ("F aggressive L/S + 5 策略（災難配置）", agg_ls, ALL5),
        ("G pump_safe + VolumeBreakout", safe, "VolumeBreakout"),
        ("H pump_safe + RisingFlag", safe, "RisingFlag"),
    ]

    results = []
    for label, mode, strats in cases:
        market = HistoricalMultiMarket(bars_by_symbol=bars_map, warmup_bars=cfg.warmup_bars)
        r = run_case(label, mode, strats, market, bars_map, uni_filtered, specs)
        results.append(r)

    # 表頭
    print(f"{'配置':<42} {'收益':>7} {'回撤':>6} {'筆數':>5} {'勝率':>5} {'毛利':>7} {'手續費':>7} {'淨利':>7}")
    print("-" * 95)
    for r in results:
        print(
            f"{r['label']:<42} "
            f"{r['return_pct']:>+6.2f}% "
            f"{r['max_dd']:>5.1f}% "
            f"{r['trades']:>5} "
            f"{r['win_rate']:>4.0f}% "
            f"{r['gross_pnl']:>+7.0f} "
            f"{r['fee']:>7.0f} "
            f"{r['net']:>+7.0f}"
        )

    print(f"\n{'='*62}")
    print("  診斷")
    print(f"{'='*62}")

    best_net = max(results, key=lambda x: x["net"])
    worst_net = min(results, key=lambda x: x["net"])
    most_trades = max(results, key=lambda x: x["trades"])
    most_fee = max(results, key=lambda x: x["fee"])

    print(f"\n1. 淨利最佳：{best_net['label']}")
    print(f"   淨 {best_net['net']:+.0f} USDT（{best_net['return_pct']:+.2f}%）· {best_net['trades']} 筆 · 手續費 {best_net['fee']:.0f}")

    print(f"\n2. 淨利最差：{worst_net['label']}")
    print(f"   淨 {worst_net['net']:+.0f} USDT · {worst_net['trades']} 筆 · 手續費 {worst_net['fee']:.0f}")

    print(f"\n3. 成交最多：{most_trades['label']} → {most_trades['trades']} 筆")
    print(f"   手續費佔本金 {most_trades['fee_pct']:.1f}%（{most_trades['fee']:.0f}/{INITIAL} USDT）")

    if most_fee["fee"] > 0:
        fee_drag = most_fee["fee"] / max(abs(most_fee["gross_pnl"]), 1) * 100
        print(f"\n4. 手續費殺手：{most_fee['label']}")
        print(f"   毛利 {most_fee['gross_pnl']:+.0f} vs 手續費 {most_fee['fee']:.0f}（手續費/毛利比 {fee_drag:.0f}%）")

    # 策略數 vs 淨利
    by_strat_count: dict[int, list] = {}
    for r in results:
        by_strat_count.setdefault(r["strategies"], []).append(r["net"])
    print("\n5. 策略數 vs 平均淨利：")
    for n in sorted(by_strat_count):
        avg = sum(by_strat_count[n]) / len(by_strat_count[n])
        print(f"   {n} 策略 → 平均淨 {avg:+.0f} USDT")

    print(f"\n{'='*62}")
    print("  優化建議（依回測）")
    print(f"{'='*62}")
    default = next(r for r in results if r["label"].startswith("A "))
    multi5_safe = next(r for r in results if r["label"].startswith("B "))
    if multi5_safe["trades"] > default["trades"] * 2:
        print(f"• 勿五策略全開：B 比 A 多 {multi5_safe['trades'] - default['trades']} 筆，手續費多 {multi5_safe['fee'] - default['fee']:.0f} USDT")
    if default["net"] >= best_net["net"] * 0.9:
        print("• 維持 pump_safe + 單策略（MomentumIgnition）為實盤預設")
    ls_results = [r for r in results if "L/S" in r["label"]]
    if ls_results and all(r["net"] < default["net"] for r in ls_results):
        print("• 今日回測多空模式不如只做多的 pump_safe，實盤避免 aggressive L/S")
    print("• 逐倉已啟用：單筆爆倉不拖全帳")
    print("• 若勝率 > 55% 但淨利為負 → 問題在手續費/交易頻率，不是訊號方向")
    print("• 下一步可調：min_signal_confidence↑、min_pump_score↑、reentry_cooldown↑")


if __name__ == "__main__":
    main()
