"""全域配置。集中管理可調參數，方便回測時用 dataclass 覆寫。"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import List


@dataclass
class TradingConfig:
    initial_balance: Decimal = Decimal("10000")
    taker_fee_rate: Decimal = Decimal("0.0005")  # 0.05%
    maker_fee_rate: Decimal = Decimal("0.0002")  # 0.02%
    symbols: List[str] = field(default_factory=lambda: ["BTC-USDT"])
    default_leverage: int = 1
    bar_interval_seconds: int = 60  # 1m K 線


DEFAULT_CONFIG = TradingConfig()
