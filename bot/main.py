"""程式入口：組裝 Broker / Market / Strategies / Manager / Engine + Dashboard。

模擬模式（預設）：
    python main.py                              # Rich Live Dashboard
    python main.py --mode web                   # Web Dashboard (http://127.0.0.1:8000)
    python main.py --mode headless              # 純文字 log

接 OKX Demo Trading（單一 symbol 雙向交易）：
    1. 複製 .env.example 為 .env 並填入 demo API key/secret/passphrase
    2. python main.py --broker okx --mode web --bars 0

Pump 模式（多 symbol 掃描小幣起漲 + 大幣波段 → 自動開合約）：
    python main.py --pump --mode web

    預設 universe 含 BTC/ETH/SOL 等大幣 + 高成交量小幣；加 --exclude-majors 可恢復舊行為。

    需要 OKX demo trading API key（也適用正式倉，但預設 OKX_DEMO=true）。
    Web UI 會多出「Pump Mode」頁面，可手動切「策略 / 風險模式」。
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from decimal import Decimal
from typing import Any, Optional

try:
    from rich.console import Console
    from rich.live import Live
except ImportError:
    print("缺少依賴：請先安裝 rich → pip install -r requirements.txt", file=sys.stderr)
    raise

from config import DEFAULT_CONFIG
from core.engine import EventLevel, TradingEngine
from core.local_broker import LocalBroker
from core.market import RandomWalkMarket
from core.strategy_manager import MarketStateDetector, StrategyManager
from strategies.atr_trailing_stop_strategy import ATRTrailingStopStrategy
from strategies.base_strategy import MarketRegime
from strategies.bollinger_strategy import BollingerStrategy
from strategies.dual_ma_strategy import DualMAStrategy
from strategies.grid_strategy import GridStrategy
from strategies.rsi_strategy import RSIStrategy
from ui.dashboard import build_layout, render


def _build_strategy_manager(symbol: str) -> StrategyManager:
    dual_ma = DualMAStrategy(symbol, params={"short_period": 10, "long_period": 30})
    bollinger = BollingerStrategy(symbol, params={"period": 20, "std_mult": 2.0})
    rsi_s = RSIStrategy(symbol, params={"period": 14, "oversold": 30, "overbought": 70})
    grid = GridStrategy(symbol, params={"levels": 5, "spacing_pct": 0.008})
    atr = ATRTrailingStopStrategy(symbol, params={"atr_period": 14, "atr_mult": 3.0})

    routing = {
        MarketRegime.TRENDING_UP:    dual_ma,
        MarketRegime.TRENDING_DOWN:  dual_ma,
        MarketRegime.RANGING:        bollinger,
        MarketRegime.LOW_VOLATILITY: bollinger,
        MarketRegime.UNKNOWN:        grid,
        MarketRegime.BREAKOUT:       rsi_s,
        MarketRegime.HIGH_VOLATILITY: atr,
    }
    return StrategyManager(
        strategies=routing,
        detector=MarketStateDetector(
            adx_period=14, atr_period=14, rsi_period=14,
            adx_trend_threshold=25.0,
            atr_panic_percentile=0.95,
            atr_low_percentile=0.30,
            rsi_extreme_low=25.0, rsi_extreme_high=75.0,
        ),
        default_regime=MarketRegime.UNKNOWN,
    )


def build_engine(symbol: str) -> tuple[TradingEngine, RandomWalkMarket]:
    cfg = DEFAULT_CONFIG
    broker = LocalBroker(
        initial_balance=cfg.initial_balance,
        taker_fee_rate=cfg.taker_fee_rate,
        maker_fee_rate=cfg.maker_fee_rate,
    )

    manager = _build_strategy_manager(symbol)
    market = RandomWalkMarket(
        symbol=symbol,
        start_price=Decimal("30000"),
        bar_seconds=cfg.bar_interval_seconds,
        seed=42,  # 固定種子讓劇本可重現；要每次不同可拿掉
    )
    engine = TradingEngine(
        broker=broker,
        strategy_manager=manager,
        symbol=symbol,
        position_fraction=Decimal("0.15"),
        leverage=cfg.default_leverage,
    )
    return engine, market


def build_okx_engine(symbol: str = "", bar: str = "", poll_seconds: float = 0.0):
    """組裝走 OKX Demo Trading 的引擎。

    - 從 .env / 環境變數讀取 OKX_API_KEY / SECRET / PASSPHRASE / DEMO / SYMBOL / BAR。
    - 對應的 broker / market 都從 OKX 拉真實狀態。
    - Engine 端的策略邏輯一行不變。
    """
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # 沒裝 dotenv 也沒關係，直接讀環境變數

    from core.okx_broker import OKXBroker
    from core.okx_client import OKXClient
    from core.okx_market import OKXMarket

    api_key = os.getenv("OKX_API_KEY", "").strip()
    api_secret = os.getenv("OKX_API_SECRET", "").strip()
    passphrase = os.getenv("OKX_PASSPHRASE", "").strip()
    demo = os.getenv("OKX_DEMO", "true").lower() != "false"
    okx_symbol = symbol or os.getenv("OKX_SYMBOL", "BTC-USDT-SWAP").strip()
    okx_bar = bar or os.getenv("OKX_BAR", "1m").strip()
    okx_poll = poll_seconds or float(os.getenv("OKX_POLL_SECONDS", "5"))

    if not api_key or not api_secret or not passphrase:
        raise SystemExit(
            "缺少 OKX 認證資訊。請複製 .env.example 為 .env 並填入 API Key/Secret/Passphrase。"
        )

    client = OKXClient(api_key, api_secret, passphrase, demo=demo)
    if not client.ping():
        raise SystemExit("OKX 認證失敗，請檢查 API Key 是否為 Demo Trading 用、IP 白名單與 passphrase。")

    broker = OKXBroker(client, symbol=okx_symbol, td_mode="cross")
    market = OKXMarket(client, symbol=okx_symbol, bar=okx_bar, poll_seconds=okx_poll, warmup_count=200)
    manager = _build_strategy_manager(okx_symbol)

    engine = TradingEngine(
        broker=broker,
        strategy_manager=manager,
        symbol=okx_symbol,
        position_fraction=Decimal("0.05"),  # OKX demo 真實下單，倉位收斂一點
        leverage=1,
    )
    print(
        f"  OKX Demo Trading {'(simulated)' if demo else '(LIVE!)'}\n"
        f"    symbol     : {okx_symbol}\n"
        f"    bar        : {okx_bar}\n"
        f"    posMode    : {broker.pos_mode}\n"
        f"    contract   : {broker.contract_value} per ct  (lot={broker.lot_size}, min={broker.min_size})\n"
        f"    equity     : {broker.equity({}):.4f} USD"
    )

    # 熱機：餵歷史 bar 給策略累積指標，但用 live=False 確保不會真的下單
    print("  warming up strategies with recent history...")
    warmup_bars = market.fetch_warmup_history()
    engine.live = False
    for bar in warmup_bars:
        engine.on_bar(bar)
    engine.live = True
    print(f"    warmed with {len(warmup_bars)} historical bars; now live\n")

    return engine, market


def run_with_dashboard(engine: TradingEngine, market: RandomWalkMarket,
                       speed: float, bars_limit: int) -> None:
    console = Console()
    layout = build_layout()
    bar_count = 0

    with Live(layout, console=console, refresh_per_second=20, screen=True) as live:
        try:
            while bars_limit == 0 or bar_count < bars_limit:
                bar = market.next_bar()
                if bar is None:
                    break
                engine.on_bar(bar)
                bar_count += 1
                live.update(render(layout, engine, bar_count))
                if speed > 0:
                    time.sleep(speed)
        except KeyboardInterrupt:
            pass

    _print_final(engine, bar_count)


def run_headless(engine: TradingEngine, market: RandomWalkMarket,
                 speed: float, bars_limit: int) -> None:
    console = Console()

    def listener(evt) -> None:
        color = {
            EventLevel.TRADE: "cyan",
            EventLevel.REGIME: "yellow",
            EventLevel.PANIC: "red",
            EventLevel.ERROR: "red",
        }.get(evt.level, "white")
        console.print(f"[{evt.timestamp:%H:%M:%S}] [{color}]{evt.level.value:6s}[/] {evt.message}")

    engine.subscribe(listener)
    bar_count = 0
    try:
        while bars_limit == 0 or bar_count < bars_limit:
            bar = market.next_bar()
            if bar is None:
                break
            engine.on_bar(bar)
            bar_count += 1
            if speed > 0:
                time.sleep(speed)
    except KeyboardInterrupt:
        pass

    _print_final(engine, bar_count)


def _print_final(engine: TradingEngine, bars: int) -> None:
    console = Console()
    snap = engine.state_snapshot()
    acc = snap["account"]
    console.rule("[bold]Run finished")
    console.print(f"Bars processed   : {bars}")
    console.print(f"Final equity     : {acc['equity']:.2f} USDT")
    console.print(f"Realized PnL     : {acc['realized_pnl']:.2f}")
    console.print(f"Unrealized PnL   : {acc['total_unrealized_pnl']:.2f}")
    console.print(f"Total fee        : {acc['total_fee_paid']:.2f}")
    console.print(f"Trades           : {acc['trades_count']}")
    console.print(f"Max drawdown     : {float(snap['max_drawdown']) * 100:.2f}%")


def run_web(engine: TradingEngine, market: RandomWalkMarket,
            speed: float, bars_limit: int, host: str, port: int) -> None:
    """以 FastAPI + WebSocket 作為 Dashboard 介面。"""
    try:
        import uvicorn
    except ImportError as exc:
        raise SystemExit(
            "缺少依賴：uvicorn / fastapi。請執行 pip install -r requirements.txt"
        ) from exc
    from webui.server import create_app

    app = create_app(engine, market, speed=speed, bars_limit=bars_limit)
    print(f"\n  Web Dashboard: http://{host}:{port}\n  (Ctrl+C 結束)\n")
    uvicorn.run(app, host=host, port=port, log_level="warning")


# ---------------------------------------------------------------------- #
# Pump mode：多 symbol 掃描（小幣起漲 + 大幣波段）
# ---------------------------------------------------------------------- #
def build_pump_engine(
    bar: str = "",
    universe_size: int = 15,
    include_majors: bool = False,
    max_concurrent_unused: Optional[int] = None,  # noqa: ARG001 - 由 risk_mode 決定
):
    """組裝 PumpEngine：scanner + multi-symbol broker + multi-symbol market。"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    from core.okx_client import OKXClient
    from core.okx_market import OKXMultiMarket
    from core.okx_multi_broker import OKXMultiBroker
    from core import risk_mode as risk_mode_mod
    from core.pump_engine import PumpEngine
    from core.scanner import Scanner

    api_key = os.getenv("OKX_API_KEY", "").strip()
    api_secret = os.getenv("OKX_API_SECRET", "").strip()
    passphrase = os.getenv("OKX_PASSPHRASE", "").strip()
    demo = os.getenv("OKX_DEMO", "true").lower() != "false"
    okx_bar = bar or os.getenv("OKX_BAR", "1m").strip()

    if not api_key or not api_secret or not passphrase:
        raise SystemExit(
            "缺少 OKX 認證資訊。請複製 .env.example 為 .env 並填入 API Key/Secret/Passphrase。"
        )

    client = OKXClient(api_key, api_secret, passphrase, demo=demo)
    if not client.ping():
        raise SystemExit("OKX 認證失敗。")

    broker = OKXMultiBroker(client, td_mode="isolated", margin_ccy="USDT")
    market = OKXMultiMarket(client, bar=okx_bar, warmup_count=120, max_history=200)
    scanner = Scanner(client, top_n=universe_size, include_majors=include_majors)

    engine = PumpEngine(
        broker=broker,
        market=market,
        scanner=scanner,
        active_strategy="HigherLow",
        risk_mode_key="swing_mid",
        bar_interval=okx_bar,
        universe_refresh_seconds=300,
        candidates_top_k=5,
        scan_interval_seconds=15.0,
    )

    print(
        f"  PumpEngine ({'demo' if demo else 'LIVE!'})\n"
        f"    bar              : {okx_bar}\n"
        f"    universe size    : {universe_size}\n"
        f"    initial equity   : {broker.equity:.4f} USD\n"
        f"    posMode          : {broker.pos_mode}\n"
    )

    # 熱機：先抓一次 universe + 對每個候選 warmup
    print("  warming up: refreshing universe and pulling history...")
    items = scanner.refresh_universe()
    print(f"    universe: {len(items)} symbols")
    broker.preload_instruments([it.inst_id for it in items])
    engine.live = False
    for it in items:
        bars = market.warmup(it.inst_id)
        if bars:
            engine._global_bar_count += len(bars)  # noqa: SLF001 — 熱機計入 bar 數
    engine._last_universe_refresh_ts = time.time()  # noqa: SLF001
    engine._universe = items                        # noqa: SLF001
    engine.live = True
    print(f"    warmed; ready (live=True)\n")

    return engine


def run_pump_web(engine: Any, host: str, port: int, tick_seconds: float) -> None:
    try:
        import uvicorn
    except ImportError as exc:
        raise SystemExit("缺少依賴：uvicorn / fastapi") from exc
    from webui.server import create_pump_app

    app = create_pump_app(engine, tick_seconds=tick_seconds)
    print(f"\n  Pump Dashboard: http://{host}:{port}/pump\n  (Ctrl+C 結束)\n")
    uvicorn.run(app, host=host, port=port, log_level="warning")


def run_pump_headless(engine: Any, tick_seconds: float) -> None:
    console = Console()

    def listener(evt) -> None:
        color = {
            EventLevel.TRADE: "cyan",
            EventLevel.REGIME: "yellow",
            EventLevel.PANIC: "red",
            EventLevel.ERROR: "red",
            EventLevel.INFO: "white",
        }.get(evt.level, "white")
        console.print(f"[{evt.timestamp:%H:%M:%S}] [{color}]{evt.level.value:6s}[/] {evt.message}")

    engine.subscribe(listener)
    try:
        while True:
            engine.tick()
            time.sleep(tick_seconds)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped by user[/]")


# ---------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--broker", choices=["local", "okx"], default="local",
                        help="local=本地模擬；okx=OKX Demo Trading（需 .env）")
    parser.add_argument("--symbol", default="",
                        help="--broker local 預設 BTC-USDT；--broker okx 預設 BTC-USDT-SWAP")
    parser.add_argument("--bar", default="", help="K 線週期（僅 OKX/Pump 有用）")
    parser.add_argument("--speed", type=float, default=0.08,
                        help="模擬模式每根 bar 之間 sleep 秒數")
    parser.add_argument("--bars", type=int, default=800,
                        help="跑幾根 bar 後停止；0 = 不限制（OKX 建議 0）")
    parser.add_argument("--mode", choices=["dashboard", "headless", "web"],
                        default="dashboard",
                        help="dashboard=Rich Live；headless=純 log；web=瀏覽器 Dashboard")
    parser.add_argument("--host", default="127.0.0.1", help="--mode web 的綁定 host")
    parser.add_argument("--port", type=int, default=8000, help="--mode web 的綁定 port")

    parser.add_argument("--autopilot", action="store_true", help="100 USDT OKX Demo 自動交易工作台")

    # Pump 模式
    parser.add_argument("--pump", action="store_true",
                        help="啟用「掃小幣起漲 + 自動開合約」模式（需 OKX 認證）")
    parser.add_argument("--universe-size", type=int, default=15,
                        help="Pump 模式：universe 名額（預設 15 小幣）")
    parser.add_argument("--include-majors", action="store_true",
                        help="Pump 模式：universe 含 BTC/ETH 等大幣（預設只有小幣）")
    parser.add_argument("--exclude-majors", action="store_true",
                        help="（已棄用）同預設行為，請改用 --include-majors")
    parser.add_argument("--tick-seconds", type=float, default=10.0,
                        help="Pump 模式：每 N 秒掃描一次（預設 10）")
    parser.add_argument("--backtest", action="store_true",
                        help="Pump 回測模式：拉 OKX 歷史 K 線重播（不需 live 下單）")
    parser.add_argument("--days", type=int, default=7,
                        help="回測天數（預設 7）")
    parser.add_argument("--strategy", default="VolumeBreakout",
                        help="Pump 起漲策略（預設 VolumeBreakout；勿逗號多開，易過度交易）")
    parser.add_argument("--risk-mode", default="pump_safe",
                        help="Pump 回測/實盤使用的風險模式（預設 pump_safe）")
    parser.add_argument("--initial-balance", type=float, default=10000.0,
                        help="回測初始 USDT")
    args = parser.parse_args()

    if args.autopilot:
        if args.pump or args.backtest:
            parser.error("--autopilot 為獨立工作台，不與 --pump / --backtest 混用")
        if args.host not in ("127.0.0.1", "localhost"):
            parser.error("自動交易工作台僅允許本機存取")
        import uvicorn
        from webui.autopilot_server import app
        uvicorn.run(app, host=args.host, port=args.port)
        return 0

    # ---- Pump backtest ----
    if args.pump and args.backtest:
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass
        from core.pump_backtest import BacktestConfig, run_pump_backtest

        cfg = BacktestConfig(
            days=args.days,
            bar=args.bar or os.getenv("OKX_BAR", "1m").strip(),
            universe_size=args.universe_size,
            initial_balance=Decimal(str(args.initial_balance)),
            strategy=args.strategy,
            risk_mode=args.risk_mode,
            include_majors=args.include_majors,
        )
        run_pump_backtest(cfg)
        return 0

    # ---- Pump mode 走獨立分支 ----
    if args.pump:
        engine = build_pump_engine(
            bar=args.bar,
            universe_size=args.universe_size,
            include_majors=args.include_majors,
        )
        if args.mode == "web":
            run_pump_web(engine, args.host, args.port, args.tick_seconds)
        else:
            run_pump_headless(engine, args.tick_seconds)
        return 0

    # ---- 既有單一 symbol 模式 ----
    if args.broker == "okx":
        engine, market = build_okx_engine(symbol=args.symbol, bar=args.bar)
        speed = 0.0
    else:
        symbol = args.symbol or "BTC-USDT"
        engine, market = build_engine(symbol)
        speed = args.speed

    if args.mode == "web":
        run_web(engine, market, speed, args.bars, args.host, args.port)
    elif args.mode == "headless":
        run_headless(engine, market, speed, args.bars)
    else:
        run_with_dashboard(engine, market, speed, args.bars)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
