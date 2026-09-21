"""OKX 永續合約 K 線數據源（REST polling 版）。

職責清楚分成兩段：

1. `fetch_warmup_history(n)` — 一次性回拉最近 N 根「已收盤」K 線（舊→新排序）。
   只負責回傳資料，不會被當成 live bar 觸發下單；呼叫端應在
   `engine.live=False` 的熱機模式下回放這些 bar 給策略累積指標。

2. `next_bar()` — 阻塞式取得「下一根新的已收盤 K 線」。
   第一次呼叫會把內部時間戳錨定到「目前最新的已收盤 bar」，因此會等到
   下一根 1m bar 收盤才回傳；之後每 `poll_seconds` 輪詢一次。

這樣的設計確保：呼叫端控制何時切換 live，避免歷史 bar 誤觸真實下單。
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional

from core.okx_client import OKXClient
from strategies.base_strategy import Bar


_BAR_INTERVAL_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1H": 3600, "2H": 7200, "4H": 14400, "6H": 21600, "12H": 43200,
    "1D": 86400,
}


def _parse_candle(row: List[str], symbol: str) -> Bar:
    """[ts(ms), o, h, l, c, vol, volCcy, volCcyQuote, confirm]"""
    return Bar(
        timestamp=datetime.fromtimestamp(int(row[0]) / 1000.0, tz=timezone.utc),
        symbol=symbol,
        open=Decimal(row[1]),
        high=Decimal(row[2]),
        low=Decimal(row[3]),
        close=Decimal(row[4]),
        volume=Decimal(row[5]),
    )


class OKXMarket:
    def __init__(
        self,
        client: OKXClient,
        symbol: str,
        bar: str = "1m",
        poll_seconds: float = 5.0,
        warmup_count: int = 200,
    ) -> None:
        if bar not in _BAR_INTERVAL_SECONDS:
            raise ValueError(f"Unsupported bar interval: {bar}")
        self.client = client
        self.symbol = symbol
        self.bar = bar
        self.poll_seconds = poll_seconds
        self.warmup_count = warmup_count
        self._last_ts_ms: int = 0

    # ------------------------------------------------------------------ #
    # 熱機階段：抓歷史 K 線
    # ------------------------------------------------------------------ #
    def fetch_warmup_history(self, count: Optional[int] = None) -> List[Bar]:
        """抓最近 N 根已收盤 K 線（舊→新）。

        副作用：把 `_last_ts_ms` 推進到拿到的最新一根，避免之後 next_bar()
        立刻把同一批歷史 bar 又當成新 bar 回傳。

        呼叫端通常會在 engine.live=False 下回放這些 bar：

            warmup = market.fetch_warmup_history()
            engine.live = False
            for bar in warmup:
                engine.on_bar(bar)
            engine.live = True
        """
        n = count or self.warmup_count
        rows = self.client.get_candles(self.symbol, self.bar, limit=n)
        confirmed = [r for r in rows if r[8] == "1"]
        confirmed.sort(key=lambda r: int(r[0]))
        bars = [_parse_candle(r, self.symbol) for r in confirmed]
        if confirmed:
            self._last_ts_ms = max(int(r[0]) for r in confirmed)
        return bars

    # ------------------------------------------------------------------ #
    # Live 階段：阻塞拿下一根新 bar
    # ------------------------------------------------------------------ #
    def next_bar(self) -> Optional[Bar]:
        """阻塞式取得下一根新的已收盤 K 線。

        - 第一次呼叫且未做過 warmup 時，會先抓一批 candle，把 `_last_ts_ms`
          錨定到目前最新已收盤 bar，因此會等下一根才回傳。
        - 後續呼叫只會回傳「比上次更新」的已收盤 bar；若一次拿到多根，
          僅回傳最舊的那一根，下次 next_bar() 再拿下一根（保持單根流式語意）。
        """
        if self._last_ts_ms == 0:
            self._anchor_now()

        while True:
            try:
                rows = self.client.get_candles(self.symbol, self.bar, limit=10)
            except Exception:  # noqa: BLE001
                time.sleep(self.poll_seconds)
                continue

            new_rows = [
                r for r in rows
                if r[8] == "1" and int(r[0]) > self._last_ts_ms
            ]
            if new_rows:
                new_rows.sort(key=lambda r: int(r[0]))
                row = new_rows[0]
                self._last_ts_ms = int(row[0])
                return _parse_candle(row, self.symbol)

            time.sleep(self.poll_seconds)

    def _anchor_now(self) -> None:
        """第一次 next_bar() 時，把 `_last_ts_ms` 錨定到「目前最新已收盤 bar」。"""
        try:
            rows = self.client.get_candles(self.symbol, self.bar, limit=10)
            confirmed = [r for r in rows if r[8] == "1"]
            if confirmed:
                self._last_ts_ms = max(int(r[0]) for r in confirmed)
                return
        except Exception:  # noqa: BLE001
            pass
        # 拿不到資料時退回用 wall clock 時間
        self._last_ts_ms = int(time.time() * 1000)


# ---------------------------------------------------------------------- #
# Multi-symbol 版本（給 PumpEngine 用）
# ---------------------------------------------------------------------- #
class OKXMultiMarket:
    """同時追蹤多個 symbol 的 K 線：
    - warmup(symbol) 一次拉 N 根歷史 bar 並把 `_last_ts` 錨在最新一根。
    - fetch_new_bars(symbol) 拉最近少量 candles，回傳「比 _last_ts 新的已收盤 bar」。
    - 自帶每 symbol 的 bars 快取（給 scanner 計算分數用）。
    """

    def __init__(
        self,
        client: OKXClient,
        bar: str = "1m",
        warmup_count: int = 100,
        max_history: int = 200,
    ) -> None:
        if bar not in _BAR_INTERVAL_SECONDS:
            raise ValueError(f"Unsupported bar interval: {bar}")
        self.client = client
        self.bar = bar
        self.warmup_count = warmup_count
        self.max_history = max_history
        self._last_ts: Dict[str, int] = {}
        self._bars: Dict[str, List[Bar]] = {}

    def bars_of(self, symbol: str) -> List[Bar]:
        return list(self._bars.get(symbol, []))

    def last_close(self, symbol: str) -> Optional[Decimal]:
        bars = self._bars.get(symbol)
        return bars[-1].close if bars else None

    def warmup(self, symbol: str) -> List[Bar]:
        try:
            rows = self.client.get_candles(symbol, self.bar, limit=self.warmup_count)
        except Exception:  # noqa: BLE001
            return []
        confirmed = [r for r in rows if r[8] == "1"]
        confirmed.sort(key=lambda r: int(r[0]))
        bars = [_parse_candle(r, symbol) for r in confirmed]
        self._bars[symbol] = bars[-self.max_history :]
        if confirmed:
            self._last_ts[symbol] = max(int(r[0]) for r in confirmed)
        return bars

    def fetch_new_bars(self, symbol: str) -> List[Bar]:
        """拉最近 candles，回傳新確認的 bar（時間升序）。
        若 symbol 還沒 warmup 過，先 anchor 到目前最新確認 bar，但本次 return 空。
        """
        if symbol not in self._last_ts:
            try:
                rows = self.client.get_candles(symbol, self.bar, limit=10)
                confirmed = [r for r in rows if r[8] == "1"]
                if confirmed:
                    self._last_ts[symbol] = max(int(r[0]) for r in confirmed)
                else:
                    self._last_ts[symbol] = int(time.time() * 1000)
            except Exception:  # noqa: BLE001
                self._last_ts[symbol] = int(time.time() * 1000)
            return []

        try:
            rows = self.client.get_candles(symbol, self.bar, limit=10)
        except Exception:  # noqa: BLE001
            return []
        new_rows = [r for r in rows if r[8] == "1" and int(r[0]) > self._last_ts[symbol]]
        if not new_rows:
            return []
        new_rows.sort(key=lambda r: int(r[0]))
        new_bars = [_parse_candle(r, symbol) for r in new_rows]
        self._bars.setdefault(symbol, []).extend(new_bars)
        if len(self._bars[symbol]) > self.max_history:
            self._bars[symbol] = self._bars[symbol][-self.max_history :]
        self._last_ts[symbol] = max(int(r[0]) for r in new_rows)
        return new_bars

    def drop(self, symbol: str) -> None:
        """從快取中移除某 symbol（universe 移除候選後呼叫）。"""
        self._bars.pop(symbol, None)
        self._last_ts.pop(symbol, None)
