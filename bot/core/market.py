"""市場數據模組。

提供兩種數據源：
1. `RandomWalkMarket`：可調整 drift / volatility / 階段切換的合成行情，
   方便讓 StrategyManager 在 Dashboard 中展示真實的策略切換。
2. `CSVMarket`：從歷史 K 線 CSV 載入（欄位 timestamp/open/high/low/close/volume）。

兩者都實作同一介面：
    next_bar() -> Optional[Bar]
讓 Engine 不關心數據來源，方便回測 / 實盤切換。
"""

from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterator, List, Optional, Protocol

from strategies.base_strategy import Bar


# ---------------------------------------------------------------------- #
# 介面
# ---------------------------------------------------------------------- #
class MarketDataSource(Protocol):
    symbol: str

    def next_bar(self) -> Optional[Bar]: ...


# ---------------------------------------------------------------------- #
# 隨機漫步（多階段）
# ---------------------------------------------------------------------- #
@dataclass
class MarketPhase:
    """一個市場階段的參數設定。"""

    name: str
    drift: float          # 每根 bar 的平均對數收益（正=漲、負=跌、0=震盪）
    volatility: float     # 每根 bar 的對數收益標準差
    bars: int             # 此階段持續幾根 bar


# 預設行情劇本：刻意設計成能依序觸發 5 種策略
DEFAULT_PHASES: List[MarketPhase] = [
    MarketPhase("warmup",        drift=0.0,      volatility=0.003, bars=80),
    MarketPhase("strong_uptrend", drift=0.0025,   volatility=0.004, bars=120),
    MarketPhase("ranging",       drift=0.0,      volatility=0.005, bars=120),
    MarketPhase("flash_crash",   drift=-0.012,   volatility=0.018, bars=25),
    MarketPhase("recovery",      drift=0.004,    volatility=0.006, bars=80),
    MarketPhase("low_vol_range", drift=0.0,      volatility=0.0025, bars=120),
    MarketPhase("strong_downtrend", drift=-0.0022, volatility=0.005, bars=120),
]


class RandomWalkMarket:
    """幾何布朗運動 + 階段切換的合成市場。

    每根 bar 的 close = prev_close * exp(drift + N(0, volatility))，
    high/low 由 close 與 open 取 max/min 後再加一個小幅振幅模擬。
    """

    def __init__(
        self,
        symbol: str = "BTC-USDT",
        start_price: Decimal = Decimal("30000"),
        bar_seconds: int = 60,
        phases: Optional[List[MarketPhase]] = None,
        loop: bool = True,
        seed: Optional[int] = None,
    ) -> None:
        self.symbol = symbol
        self.bar_seconds = bar_seconds
        self.phases: List[MarketPhase] = phases or list(DEFAULT_PHASES)
        self.loop = loop
        self._rng = random.Random(seed)

        self._price: float = float(start_price)
        self._timestamp: datetime = datetime.now(timezone.utc).replace(microsecond=0)
        self._phase_idx: int = 0
        self._bars_in_phase: int = 0

    # ------------------ phases 控制 ------------------
    @property
    def current_phase(self) -> MarketPhase:
        return self.phases[self._phase_idx]

    def _advance_phase(self) -> None:
        self._bars_in_phase += 1
        if self._bars_in_phase >= self.current_phase.bars:
            self._bars_in_phase = 0
            self._phase_idx += 1
            if self._phase_idx >= len(self.phases):
                if self.loop:
                    self._phase_idx = 0
                else:
                    self._phase_idx = len(self.phases) - 1  # 卡在最後一個階段

    # ------------------ 介面 ------------------
    def next_bar(self) -> Bar:
        phase = self.current_phase
        # 對數收益
        log_ret = self._rng.gauss(phase.drift, phase.volatility)
        open_price = self._price
        close_price = max(0.01, open_price * math.exp(log_ret))

        # bar 內振幅：以 close 為基準額外抖動
        wick = abs(self._rng.gauss(0, phase.volatility / 2)) * close_price
        high = max(open_price, close_price) + wick
        low = min(open_price, close_price) - wick
        low = max(0.01, low)
        volume = abs(self._rng.gauss(50, 15))

        bar = Bar(
            timestamp=self._timestamp,
            symbol=self.symbol,
            open=Decimal(f"{open_price:.4f}"),
            high=Decimal(f"{high:.4f}"),
            low=Decimal(f"{low:.4f}"),
            close=Decimal(f"{close_price:.4f}"),
            volume=Decimal(f"{volume:.4f}"),
        )

        self._price = close_price
        self._timestamp += timedelta(seconds=self.bar_seconds)
        self._advance_phase()
        return bar

    def __iter__(self) -> Iterator[Bar]:
        while True:
            yield self.next_bar()


# ---------------------------------------------------------------------- #
# CSV
# ---------------------------------------------------------------------- #
class CSVMarket:
    """從 CSV 載入歷史 K 線。

    CSV 欄位（含表頭）：timestamp, open, high, low, close, volume
    timestamp 接受 ISO8601 字串或 unix 秒。
    """

    def __init__(self, path: str | Path, symbol: str) -> None:
        self.symbol = symbol
        self._bars: List[Bar] = self._load(Path(path), symbol)
        self._idx: int = 0

    @staticmethod
    def _parse_ts(raw: str) -> datetime:
        raw = raw.strip()
        if raw.isdigit():
            return datetime.fromtimestamp(int(raw), tz=timezone.utc)
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))

    @classmethod
    def _load(cls, path: Path, symbol: str) -> List[Bar]:
        bars: List[Bar] = []
        with path.open("r", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                bars.append(
                    Bar(
                        timestamp=cls._parse_ts(row["timestamp"]),
                        symbol=symbol,
                        open=Decimal(row["open"]),
                        high=Decimal(row["high"]),
                        low=Decimal(row["low"]),
                        close=Decimal(row["close"]),
                        volume=Decimal(row.get("volume", "0")),
                    )
                )
        return bars

    def next_bar(self) -> Optional[Bar]:
        if self._idx >= len(self._bars):
            return None
        bar = self._bars[self._idx]
        self._idx += 1
        return bar

    def __len__(self) -> int:
        return len(self._bars)
