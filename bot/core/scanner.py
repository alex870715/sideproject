"""Symbol Scanner — 在 OKX USDT-SWAP 市場挑出「值得跑 pump 策略」的標的。

兩階段過濾，目的是把 ~150 個 SWAP 收斂成 ~30 個高活躍候選，並進一步排序。

階段 1：成交量過濾（粗篩，大概每 5 分鐘做一次就夠）
- `/api/v5/market/tickers` 一次拿全部 SWAP 的 24h 行情。
- 過濾條件：USDT-margined、24h volCcyQuote >= min_volume_usdt（預設 5,000,000）。
- 預設 `include_majors=True`：保留 BTC/ETH/SOL 等大幣名額，其餘 slot 給高成交量小幣。
- 排序：大幣依 volCcyQuote 降序 pin 最多 `max_major_slots` 個；小幣依 volCcyQuote 填滿剩餘名額。

階段 2：起漲分數（細篩，每根 bar 對候選計算）
- 由 PumpEngine 在每根 tick 用候選的近 N 根 1m K 線重算「動能分數」與「量能分數」，
  選出當下排名最高的 K 個候選餵給策略。
- 大幣只有在量能/動能訊號夠強時才會被策略開倉（與小幣同一套 VolumeBreakout / MomentumIgnition）。

對外 API：
- `Scanner.refresh_universe()`     — 拉 tickers 並更新候選 universe（回傳 list of dicts）。
- `pump_score(bars)`                — 給定一個 symbol 的近期 K 線，算 0~100 的綜合分數。
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, FrozenSet, List, Optional

from core.okx_client import OKXClient
from strategies.base_strategy import Bar
from strategies.indicators import sma

# 流動性高、適合波段多空的大幣 / 主流幣（base symbol，不含 -USDT-SWAP）
# 非加密貨幣 / Demo 假標的（股票、黃金、穩定幣对等）— 不納入 pump universe
NON_CRYPTO_BASES: FrozenSet[str] = frozenset({
    "XAU", "XAG", "NVDA", "TSLA", "AAPL", "AMZN", "GOOGL", "GOOG", "META", "MSFT",
    "USDC", "USDG",
})
MAJOR_BASES: FrozenSet[str] = frozenset({
    "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "LINK", "AVAX", "ADA", "SUI",
    "DOT", "POL", "LTC", "BCH", "FIL", "APT", "ARB", "OP", "NEAR", "TON",
})


def _base_symbol(inst_id: str) -> str:
    return inst_id.split("-")[0].upper()


@dataclass
class UniverseItem:
    inst_id: str
    last: Decimal
    vol_quote_24h: Decimal       # 24 小時 USDT 成交量
    pct_24h: float                # 24 小時漲跌幅
    open_24h: Decimal


def _to_decimal(v: Any) -> Decimal:
    try:
        return Decimal(str(v))
    except Exception:  # noqa: BLE001
        return Decimal("0")


class Scanner:
    def __init__(
        self,
        client: OKXClient,
        top_n: int = 30,
        min_volume_usdt: Decimal = Decimal("15000000"),
        exclude_symbols: Optional[List[str]] = None,
        include_majors: bool = True,
        max_major_slots: int = 8,
    ) -> None:
        self.client = client
        self.top_n = top_n
        self.min_volume_usdt = Decimal(min_volume_usdt)
        self.include_majors = include_majors
        self.max_major_slots = max(0, max_major_slots)
        self.exclude_symbols = set(exclude_symbols or [])
        if not include_majors:
            self.exclude_symbols |= {f"{base}-USDT-SWAP" for base in MAJOR_BASES}
            self.exclude_symbols |= {"BTC-USDC-SWAP", "ETH-USDC-SWAP"}

        self._last_refresh_ts: float = 0.0
        self._universe: List[UniverseItem] = []

    # ------------------------------------------------------------------ #
    # 階段 1：universe
    # ------------------------------------------------------------------ #
    def refresh_universe(self) -> List[UniverseItem]:
        rows = self.client.get_tickers(inst_type="SWAP")
        items: List[UniverseItem] = []
        for r in rows:
            inst_id = r.get("instId", "")
            if not inst_id.endswith("-USDT-SWAP"):
                continue  # 只看 USDT 本位的永續
            if inst_id in self.exclude_symbols:
                continue
            # OKX demo 會放一些 TEST*-USDT-SWAP 的偽幣 symbol；過濾掉
            base = inst_id.split("-")[0].upper()
            if base.startswith("TEST"):
                continue
            if base in NON_CRYPTO_BASES:
                continue

            last = _to_decimal(r.get("last"))
            open_24h = _to_decimal(r.get("open24h"))

            # OKX demo trading 的 tickers 沒有 volCcyQuote24h 欄位；
            # 自己用 volCcy24h（基礎幣 24h 成交量）× last 推 USDT 成交量。
            vol_q = _to_decimal(r.get("volCcyQuote24h"))
            if vol_q <= 0:
                vol_ccy = _to_decimal(r.get("volCcy24h"))
                if vol_ccy > 0 and last > 0:
                    vol_q = vol_ccy * last

            if vol_q < self.min_volume_usdt:
                continue

            pct = 0.0
            if open_24h > 0:
                pct = float((last - open_24h) / open_24h)
            items.append(
                UniverseItem(
                    inst_id=inst_id,
                    last=last,
                    vol_quote_24h=vol_q,
                    pct_24h=pct,
                    open_24h=open_24h,
                )
            )

        if self.include_majors:
            majors = [i for i in items if _base_symbol(i.inst_id) in MAJOR_BASES]
            alts = [i for i in items if _base_symbol(i.inst_id) not in MAJOR_BASES]
            majors.sort(key=lambda x: x.vol_quote_24h, reverse=True)
            alts.sort(key=lambda x: x.vol_quote_24h, reverse=True)
            pinned = majors[: self.max_major_slots]
            alt_n = max(0, self.top_n - len(pinned))
            items = pinned + alts[:alt_n]
        else:
            items.sort(key=lambda x: x.vol_quote_24h, reverse=True)
            items = items[: self.top_n]

        self._universe = items
        self._last_refresh_ts = time.time()
        return items

    @property
    def universe(self) -> List[UniverseItem]:
        return list(self._universe)

    # ------------------------------------------------------------------ #
    # 階段 2：bar-level 分數
    # ------------------------------------------------------------------ #
    @staticmethod
    def pump_score(bars: List[Bar], vol_lookback: int = 20) -> float:
        """以最近一根 bar 相對前 N 根的「量比 + 動能」算 0~100 分。

        分數設計（簡單但實用）：
        - vol_ratio  = bar.volume / SMA(volume, lookback)         （>= 1 才有意義）
        - momentum   = (bar.close - bars[-lookback].close) / bars[-lookback].close
        - close_loc  = (bar.close - lookback_low) / (lookback_high - lookback_low)
                       — 越靠近期高點分數越高
        - score = 50*tanh((vol_ratio - 1) / 3) + 30*momentum*100 + 20*close_loc
                 （飽和到 0~100）
        """
        if len(bars) < vol_lookback + 2:
            return 0.0

        last = bars[-1]
        prev_window = bars[-vol_lookback - 1 : -1]
        vol_avg = sma([b.volume for b in prev_window], vol_lookback) or 0.0
        vol_ratio = (float(last.volume) / vol_avg) if vol_avg > 0 else 1.0

        ref = prev_window[0]
        if ref.close <= 0:
            return 0.0
        momentum = float((last.close - ref.close) / ref.close)

        highs = [float(b.high) for b in prev_window]
        lows = [float(b.low) for b in prev_window]
        h, l = max(highs), min(lows)
        close_loc = ((float(last.close) - l) / (h - l)) if h > l else 0.5
        close_loc = max(0.0, min(1.0, close_loc))

        # smooth 化的 vol_ratio：tanh 飽和到 0~1
        import math
        vol_part = 50.0 * math.tanh(max(0.0, vol_ratio - 1.0) / 3.0)
        # momentum 直接乘 100 再封頂；2% 漲幅 = 滿分 30
        mom_part = max(-15.0, min(30.0, momentum * 100.0 * 15.0))  # 2% → 30, -1% → -15
        loc_part = 20.0 * close_loc
        score = vol_part + mom_part + loc_part
        return round(max(0.0, min(100.0, score)), 2)

    @staticmethod
    def rank_candidates(
        symbol_bars: Dict[str, List[Bar]],
        top_k: int,
        min_score: float = 0.0,
        vol_lookback: int = 20,
    ) -> List[Dict[str, Any]]:
        """對給定的 {symbol → bars} 計算 pump_score，回傳 top_k 並含分數。"""
        scored: List[Dict[str, Any]] = []
        for sym, bars in symbol_bars.items():
            if not bars:
                continue
            score = Scanner.pump_score(bars, vol_lookback=vol_lookback)
            if score < min_score:
                continue
            last = bars[-1]
            scored.append({
                "symbol": sym,
                "score": score,
                "last_close": float(last.close),
                "bars_loaded": len(bars),
            })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[: top_k]
