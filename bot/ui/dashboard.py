"""Rich Live Dashboard。

三個區塊：
  ┌──────────────────────────────────────────────────────┐
  │  Header (標題 + bar count)                           │
  ├────────────────────────┬─────────────────────────────┤
  │  Market State          │  Account                    │
  │  (價格/regime/策略)    │  (餘額/權益/回撤/持倉)      │
  ├────────────────────────┴─────────────────────────────┤
  │  Trade Log（滾動）                                   │
  └──────────────────────────────────────────────────────┘

設計：
- Dashboard 是純展示元件；它從 `engine.state_snapshot()` 與 `engine.events`
  讀取狀態，不主動觸發任何交易動作。
- `render()` 每次回傳一個 `Layout`；由 main.py 用 `rich.live.Live` 包起來。
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List

from rich.align import Align
from rich.console import Group
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from core.engine import Event, EventLevel, TradingEngine


_REGIME_STYLE = {
    "TRENDING_UP": "bold green",
    "TRENDING_DOWN": "bold red",
    "RANGING": "yellow",
    "LOW_VOLATILITY": "cyan",
    "HIGH_VOLATILITY": "bold red on yellow",
    "BREAKOUT": "magenta",
    "UNKNOWN": "dim",
}

_LEVEL_STYLE = {
    EventLevel.INFO: "white",
    EventLevel.TRADE: "bright_cyan",
    EventLevel.REGIME: "bright_yellow",
    EventLevel.PANIC: "bold red",
    EventLevel.ERROR: "red",
}


def _fmt_decimal(value, prec: int = 2, sign: bool = False) -> str:
    if value is None:
        return "-"
    if not isinstance(value, Decimal):
        try:
            value = Decimal(str(value))
        except Exception:  # noqa: BLE001
            return str(value)
    s = f"{value:,.{prec}f}"
    if sign and value > 0:
        s = "+" + s
    return s


def _fmt_pct(value, prec: int = 2) -> str:
    if value is None:
        return "-"
    try:
        v = float(value) * 100.0
    except Exception:  # noqa: BLE001
        return str(value)
    return f"{v:.{prec}f}%"


# ---------------------------------------------------------------------- #
# 區塊
# ---------------------------------------------------------------------- #
def _market_panel(state: dict) -> Panel:
    regime = state["regime"]
    style = _REGIME_STYLE.get(regime, "white")

    table = Table.grid(expand=True, padding=(0, 1))
    table.add_column(style="bold", width=14)
    table.add_column()

    table.add_row("Symbol", str(state["symbol"]))
    table.add_row("Last price", _fmt_decimal(state["last_price"], 2))

    table.add_row("Regime", Text(regime, style=style))
    table.add_row("Active strategy", Text(state["active_strategy"], style="bold cyan"))
    if state.get("regime_note"):
        table.add_row("Note", Text(state["regime_note"], style="dim"))

    ind = state.get("indicators", {})
    indicators = Table.grid(expand=True, padding=(0, 1))
    indicators.add_column(style="bold dim", width=10)
    indicators.add_column()
    indicators.add_row("ADX",  f"{ind.get('adx'):.2f}" if ind.get("adx") is not None else "-")
    indicators.add_row("ATR",  f"{ind.get('atr'):.4f}" if ind.get("atr") is not None else "-")
    indicators.add_row("ATR%", _fmt_pct(ind.get("atr_pct"), 1))
    indicators.add_row("RSI",  f"{ind.get('rsi'):.1f}" if ind.get("rsi") is not None else "-")

    body = Group(table, Text(""), Text("Indicators", style="bold dim"), indicators)
    return Panel(body, title="[bold]Market State", border_style="blue")


def _account_panel(state: dict) -> Panel:
    acc = state["account"]
    table = Table.grid(expand=True, padding=(0, 1))
    table.add_column(style="bold", width=18)
    table.add_column(justify="right")

    table.add_row("Initial balance", _fmt_decimal(acc["initial_balance"], 2) + " USDT")
    table.add_row("Balance",         _fmt_decimal(acc["balance"], 2) + " USDT")
    equity_color = "green" if acc["equity"] >= acc["initial_balance"] else "red"
    table.add_row(
        "Equity",
        Text(_fmt_decimal(acc["equity"], 2) + " USDT", style=equity_color),
    )
    ret = acc.get("return_pct", Decimal("0"))
    table.add_row(
        "Return",
        Text(_fmt_pct(ret, 2), style="green" if ret >= 0 else "red"),
    )
    table.add_row("Realized PnL",   _fmt_decimal(acc["realized_pnl"], 2, sign=True))
    table.add_row("Unrealized PnL", _fmt_decimal(acc["total_unrealized_pnl"], 2, sign=True))
    table.add_row("Total fee",      _fmt_decimal(acc["total_fee_paid"], 2))
    table.add_row("Trades",         str(acc["trades_count"]))

    dd = state.get("current_drawdown", Decimal("0"))
    max_dd = state.get("max_drawdown", Decimal("0"))
    table.add_row("Drawdown",      Text(_fmt_pct(dd, 2), style="red" if dd > 0 else "white"))
    table.add_row("Max drawdown",  Text(_fmt_pct(max_dd, 2), style="bold red" if max_dd > 0 else "white"))

    # 持倉
    pos_table = Table(show_header=True, header_style="bold dim", expand=True, box=None)
    pos_table.add_column("Symbol")
    pos_table.add_column("Side")
    pos_table.add_column("Qty", justify="right")
    pos_table.add_column("Entry", justify="right")
    pos_table.add_column("uPnL", justify="right")

    open_positions = acc.get("open_positions", {})
    if not open_positions:
        pos_table.add_row("-", "-", "-", "-", "-")
    else:
        unrl = acc.get("unrealized_pnl_by_symbol", {})
        for sym, p in open_positions.items():
            side_style = "green" if p["side"] == "LONG" else "red"
            up = unrl.get(sym, Decimal("0"))
            pos_table.add_row(
                sym,
                Text(p["side"], style=side_style),
                _fmt_decimal(p["quantity"], 6),
                _fmt_decimal(p["avg_entry_price"], 2),
                Text(
                    _fmt_decimal(up, 2, sign=True),
                    style="green" if up >= 0 else "red",
                ),
            )

    body = Group(table, Text(""), Text("Open positions", style="bold dim"), pos_table)
    return Panel(body, title="[bold]Account", border_style="green")


def _log_panel(events: List[Event], max_lines: int = 18) -> Panel:
    table = Table(show_header=False, expand=True, box=None, padding=(0, 1))
    table.add_column("Time", style="dim", width=8, no_wrap=True)
    table.add_column("Lvl", width=7, no_wrap=True)
    table.add_column("Msg")

    if not events:
        table.add_row("-", "-", Text("等待事件...", style="dim"))
    else:
        for evt in events[-max_lines:]:
            ts = evt.timestamp.strftime("%H:%M:%S")
            table.add_row(
                ts,
                Text(evt.level.value, style=_LEVEL_STYLE.get(evt.level, "white")),
                Text(evt.message),
            )
    return Panel(table, title="[bold]Trade Log", border_style="magenta")


def _header_panel(state: dict, bar_count: int) -> Panel:
    title = Text("Crypto Trading Bot — Simulated", style="bold white on blue")
    sub = Text(
        f"  bars={bar_count}   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        style="dim",
    )
    return Panel(Align.left(Group(title, sub)), border_style="blue")


# ---------------------------------------------------------------------- #
# 對外
# ---------------------------------------------------------------------- #
def build_layout() -> Layout:
    layout = Layout()
    layout.split(
        Layout(name="header", size=4),
        Layout(name="body", ratio=1),
        Layout(name="log", size=22),
    )
    layout["body"].split_row(
        Layout(name="market"),
        Layout(name="account"),
    )
    return layout


def render(layout: Layout, engine: TradingEngine, bar_count: int) -> Layout:
    state = engine.state_snapshot()
    layout["header"].update(_header_panel(state, bar_count))
    layout["market"].update(_market_panel(state))
    layout["account"].update(_account_panel(state))
    layout["log"].update(_log_panel(engine.events))
    return layout
