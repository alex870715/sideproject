"""Isolated, unleveraged spot research. Never loads credentials or sends orders."""
from __future__ import annotations

import hashlib
import json
import math
import time
import httpx
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from core.okx_market import _BAR_INTERVAL_SECONDS, _parse_candle
from strategies.base_strategy import SignalAction
from strategies.pump import PUMP_STRATEGY_REGISTRY, strategy_catalog

STRATEGIES = ("HigherLow", "VolumeBreakout", "VolumeReversion", "MomentumIgnition")
HORIZONS = {
    "short": dict(label="短線", bar="15m", days=30, max_hold=96),
    "medium": dict(label="中線", bar="1H", days=90, max_hold=240),
    "long": dict(label="長線", bar="4H", days=180, max_hold=180),
}


def validate_params(name, params):
    cls = PUMP_STRATEGY_REGISTRY[name]
    meta = cls.param_meta()
    for key, value in params.items():
        if key not in meta:
            raise ValueError(f"不支援的策略參數：{key}")
        rule = meta[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{key} 必須是有限數值")
        if rule.get("type") == "int" and int(value) != value:
            raise ValueError(f"{key} 必須是整數")
        if value < rule.get("min", -math.inf) or value > rule.get("max", math.inf):
            raise ValueError(f"{key} 超出範圍")
    cls("VALIDATE", params)
    return params


class ResearchConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    name: str = Field(default="我的策略", min_length=1, max_length=60)
    strategy: Literal["HigherLow", "VolumeBreakout", "VolumeReversion", "MomentumIgnition"] = "HigherLow"
    horizon: Literal["short", "medium", "long"] = "medium"
    symbol: Literal["BTC-USDT", "ETH-USDT", "SOL-USDT"] = "BTC-USDT"
    days: int = Field(default=90, ge=7, le=365, strict=True)
    initial_balance: float = Field(default=10000, ge=100, le=10000000)
    risk_pct: float = Field(default=0.5, ge=0.1, le=2)
    allocation_pct: float = Field(default=25, ge=1, le=100)
    stop_atr: float = Field(default=2.5, ge=1, le=6)
    reward_r: float = Field(default=2.5, ge=0.5, le=6)
    max_hold: int = Field(default=240, ge=1, le=720, strict=True)
    fee_bps: float = Field(default=10, ge=0, le=100)
    slippage_bps: float = Field(default=5, ge=0, le=100)
    params: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid(self):
        validate_params(self.strategy, self.params)
        if self.days * 86400 // _BAR_INTERVAL_SECONDS[HORIZONS[self.horizon]["bar"]] > 18000:
            raise ValueError("最多 18,000 根 K 線，請縮短期間或選擇較長週期")
        return self


def catalog():
    return {"horizons": HORIZONS, "strategies": [dict(key=n, **strategy_catalog(n),
        params=PUMP_STRATEGY_REGISTRY[n].default_params(), meta=PUMP_STRATEGY_REGISTRY[n].param_meta()) for n in STRATEGIES]}


def fetch_bars(config, progress=lambda message: None):
    interval = HORIZONS[config.horizon]["bar"]
    seconds = _BAR_INTERVAL_SECONDS[interval]
    now = int(datetime.now(timezone.utc).timestamp())
    end = now // seconds * seconds
    start = end - config.days * 86400
    warm_start = start - 150 * seconds
    rows, cursor = {}, None
    client = httpx.Client(base_url="https://www.okx.com", timeout=15)
    try:
        for page in range(185):
            params = {"instId": config.symbol, "bar": interval, "limit": "100"}
            if cursor is not None:
                params["after"] = str(cursor)
            for attempt in range(3):
                response = client.get("/api/v5/market/history-candles", params=params)
                if response.status_code not in (429, 502, 503, 504) or attempt == 2:
                    break
                time.sleep(0.5 * (attempt + 1))
            response.raise_for_status()
            payload = response.json()
            if payload.get("code") != "0":
                raise ValueError("OKX 歷史資料暫時不可用，請稍後重試")
            batch = payload.get("data") or []
            if not batch:
                break
            for row in batch:
                ts = int(row[0]) // 1000
                if row[-1] == "1" and warm_start <= ts < end:
                    rows[ts] = row
            oldest = min(int(r[0]) for r in batch)
            progress(f"下載 OKX 已收盤 K 線 · {len(rows):,} 根")
            if oldest // 1000 <= warm_start or (cursor is not None and oldest >= cursor):
                break
            cursor = oldest
    finally:
        client.close()
    bars = [_parse_candle(rows[t], config.symbol) for t in sorted(rows)]
    if not bars or bars[0].timestamp.timestamp() > warm_start or bars[-1].timestamp.timestamp() < end - seconds:
        raise ValueError("OKX 資料不足以覆蓋指定期間與預熱，請縮短期間後重試")
    for b in bars:
        values = [b.open, b.high, b.low, b.close, b.volume]
        if any(not v.is_finite() for v in values) or min(values[:4]) <= 0 or b.volume < 0:
            raise ValueError("歷史 K 線含無效數值，停止回測")
        if b.low > min(b.open, b.close) or b.high < max(b.open, b.close) or b.low > b.high:
            raise ValueError("歷史 K 線價格範圍不一致，停止回測")
    for prev, cur in zip(bars, bars[1:]):
        if (cur.timestamp - prev.timestamp).total_seconds() != seconds:
            raise ValueError("歷史 K 線有缺口，停止回測以避免誤導")
    return bars, start


def simulate(config, bars, start_index=150):
    """Close signal → next open fill. Stop first on ambiguous intrabar paths."""
    strategy = PUMP_STRATEGY_REGISTRY[config.strategy](config.symbol, config.params)
    fee, slip = config.fee_bps / 10000, config.slippage_bps / 10000
    cash, position, pending = config.initial_balance, None, None
    curve, trades = [], []
    peak, drawdown, fees = cash, 0.0, 0.0
    if len(bars) <= start_index + 1:
        raise ValueError("回測樣本不足")

    def close(price, bar, reason):
        nonlocal cash, position, fees
        fill = max(0, price * (1 - slip))
        exit_fee = fill * position["qty"] * fee
        pnl = (fill - position["entry"]) * position["qty"] - position["fee"] - exit_fee
        cash += fill * position["qty"] - exit_fee
        fees += exit_fee
        trades.append(dict(entry_time=position["time"], exit_time=bar.timestamp.isoformat(),
            entry=position["entry"], exit=fill, quantity=position["qty"], pnl=pnl,
            fees=position["fee"] + exit_fee, reason=reason))
        position = None

    for i, bar in enumerate(bars):
        o, h, l, c = map(float, (bar.open, bar.high, bar.low, bar.close))
        if i >= start_index:
            if pending and position is None:
                entry = o * (1 + slip)
                distance = pending
                qty = min(cash * config.risk_pct / 100 / (distance + entry * (2 * fee + 2 * slip)),
                          cash * config.allocation_pct / 100 / (entry * (1 + fee)))
                entry_fee = entry * qty * fee
                cash -= entry * qty + entry_fee
                fees += entry_fee
                position = dict(entry=entry, qty=qty, fee=entry_fee, stop=max(0, entry-distance),
                    target=entry+distance*config.reward_r, time=bar.timestamp.isoformat(), index=i)
            pending = None
            if position:
                if l <= position["stop"]:
                    close(min(o, position["stop"]), bar, "停損")
                elif h >= position["target"]:
                    close(position["target"], bar, "止盈")
                elif i-position["index"] >= config.max_hold:
                    close(o, bar, "持倉到期")
            if i == len(bars)-1 and position:
                close(c, bar, "期末平倉")
            equity = cash + (position["qty"] * c if position else 0)
            peak = max(peak, equity)
            drawdown = max(drawdown, (peak-equity)/peak)
            curve.append(dict(t=bar.timestamp.isoformat(), equity=equity,
                benchmark=config.initial_balance * c / float(bars[start_index].open)))
        signal = strategy.push_bar(bar)
        if i >= start_index-1 and position is None and signal and signal.action == SignalAction.BUY and i >= 14:
            tr = [max(float(bars[j].high-bars[j].low), abs(float(bars[j].high-bars[j-1].close)),
                      abs(float(bars[j].low-bars[j-1].close))) for j in range(i-13, i+1)]
            pending = sum(tr)/14 * config.stop_atr or None
    wins = [t["pnl"] for t in trades if t["pnl"] > 0]
    losses = [t["pnl"] for t in trades if t["pnl"] < 0]
    return dict(return_pct=(cash/config.initial_balance-1)*100, final_equity=cash,
        max_drawdown_pct=drawdown*100, total_trades=len(trades), total_fees=fees,
        win_rate=len(wins)/len(trades)*100 if trades else None,
        profit_factor=sum(wins)/abs(sum(losses)) if losses else None,
        benchmark_pct=(curve[-1]["benchmark"]/config.initial_balance-1)*100,
        curve=curve, trades=trades)


def run_research(config, progress=lambda message: None):
    config = ResearchConfig(**{**config.model_dump(), "params": {
        **PUMP_STRATEGY_REGISTRY[config.strategy].default_params(), **config.params}})
    bars, start = fetch_bars(config, progress)
    first = next(i for i,b in enumerate(bars) if b.timestamp.timestamp() >= start)
    progress("計算策略、交易成本與後段驗證…")
    result = simulate(config, bars, first)
    split = first + (len(bars)-first)*7//10
    # Restart capital and positions for chronological holdout; only prior bars warm indicators.
    holdout = simulate(config, bars[max(0, split-150):], min(150, split))
    warnings = ["現貨、只做多、1 倍曝險研究；不是永續合約或原 Pump 引擎的等價回測。",
        "已計雙邊手續費與滑價；未模擬委託簿、部分成交與最小下單量。",
        "最大回撤依收盤權益計算；停損不是保證成交價格。",
        "後 30% 為時間留出驗證；反覆依此調參仍會過度擬合。"]
    if result["total_trades"] < 30:
        warnings.append("少於 30 筆交易：樣本不足，暫不根據此結果增加資金。")
    if holdout["return_pct"] <= 0:
        warnings.append("後段驗證報酬未大於零：建議保留研究狀態，檢查行情適用性與交易成本。")
    if result["return_pct"] < result["benchmark_pct"]:
        warnings.append("策略報酬低於買入持有；請同時比較資金曝險與回撤。")
    fingerprint = hashlib.sha256(json.dumps([
        [b.timestamp.isoformat(), str(b.open), str(b.high), str(b.low), str(b.close), str(b.volume)]
        for b in bars]).encode()).hexdigest()
    return dict(model_version="spot-research-v1", data_sha256=fingerprint,
        config=config.model_dump(), interval=HORIZONS[config.horizon]["bar"],
        source="OKX public spot history-candles", generated_at=datetime.now(timezone.utc).isoformat(),
        start=bars[first].timestamp.isoformat(), end=bars[-1].timestamp.isoformat(),
        bars=len(bars)-first, result=result,
        holdout={k:v for k,v in holdout.items() if k not in ("curve", "trades")}, warnings=warnings)
