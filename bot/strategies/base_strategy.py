"""策略基底類別與相關資料結構。

設計原則：
- 策略只負責「讀數據 → 產出 Signal」，不直接呼叫 Account 下單；
  下單交由 `core/engine.py` 統一執行。這樣同一份策略邏輯可在
  「即時模擬 / 歷史回測 / 真實 API」三種模式下原封不動地復用。
- 所有子策略必須宣告 `name` 與 `suitable_regimes`，
  讓 `core/strategy_manager.py` 能依目前市場狀態（趨勢 / 震盪 / 突破…）
  自動切換到合適的策略。
- 策略內部維護自己的 K 線歷史 `self.bars`，預設保留最近 500 根，
  超參數可透過 `params["history_size"]` 覆寫。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional


class SignalAction(str, Enum):
    BUY = "BUY"                  # 開多 / 加多
    SELL = "SELL"                # 開空 / 加空
    CLOSE_LONG = "CLOSE_LONG"
    CLOSE_SHORT = "CLOSE_SHORT"
    HOLD = "HOLD"


class MarketRegime(str, Enum):
    """市場狀態分類，供 StrategyManager 路由策略。"""

    TRENDING_UP = "TRENDING_UP"
    TRENDING_DOWN = "TRENDING_DOWN"
    RANGING = "RANGING"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    LOW_VOLATILITY = "LOW_VOLATILITY"
    BREAKOUT = "BREAKOUT"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class Bar:
    """單根 K 線。所有價格與成交量採 Decimal 以對齊 Account 的精度。"""

    timestamp: datetime
    symbol: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


@dataclass(frozen=True)
class Signal:
    """策略產出的交易訊號；Engine 會把它翻譯成 Account 的下單呼叫。"""

    timestamp: datetime
    symbol: str
    action: SignalAction
    price: Decimal
    confidence: float = 1.0
    quantity: Optional[Decimal] = None  # None 代表交由 Engine 的倉位管理決定
    reason: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)


class BaseStrategy(ABC):
    """所有交易策略的抽象基底類別。

    子類別必須實作：
        check_signal(bar) -> Optional[Signal]

    可選覆寫：
        on_init()                              # 預熱 / 計算初始指標
        on_tick(price, timestamp)              # 高頻策略可用
        on_order_filled(trade)                 # 收到自身訂單成交回報

    類別層級必填：
        name:               策略名稱（顯示於 Dashboard）
        suitable_regimes:   此策略適用的市場狀態
    """

    name: str = "BaseStrategy"
    suitable_regimes: List[MarketRegime] = []

    def __init__(
        self,
        symbol: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.symbol: str = symbol
        self.params: Dict[str, Any] = dict(params) if params else {}
        self.bars: List[Bar] = []
        self._enabled: bool = True
        self._initialized: bool = False

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def init(self) -> None:
        """由 Engine 在啟動時呼叫一次；確保 `on_init` 不會重複執行。"""
        if not self._initialized:
            self.on_init()
            self._initialized = True

    def on_init(self) -> None:
        """子類別可覆寫；用於預載指標、預熱等。預設不做事。"""
        return None

    def on_tick(self, price: Decimal, timestamp: datetime) -> Optional[Signal]:
        """子類別可覆寫；高頻 / 即時策略可用。預設不產生訊號。"""
        return None

    @abstractmethod
    def check_signal(self, bar: Bar) -> Optional[Signal]:
        """每根 K 線收盤觸發；返回 `Signal` 或 `None`。子類別必須實作。"""

    def on_order_filled(self, trade: Any) -> None:  # noqa: ANN401  (避免循環匯入)
        """成交回報；子類別若需追蹤倉位變化可覆寫。"""
        return None

    # ------------------------------------------------------------------ #
    # Engine 呼叫的入口
    # ------------------------------------------------------------------ #
    def push_bar(self, bar: Bar) -> Optional[Signal]:
        """Engine 每根 K 線呼叫。

        即使策略被 disable，仍會更新 `self.bars`（保持指標熱機，避免被
        StrategyManager 切換回來時冷啟動）；但只有 enabled 時才會
        呼叫 `check_signal` 產生訊號。
        """
        if bar.symbol != self.symbol:
            return None
        self.bars.append(bar)
        max_keep = int(self.params.get("history_size", 500))
        if len(self.bars) > max_keep:
            self.bars = self.bars[-max_keep:]
        if not self._enabled:
            return None
        return self.check_signal(bar)

    # ------------------------------------------------------------------ #
    # 開關 & 工具
    # ------------------------------------------------------------------ #
    @property
    def closes(self) -> List[Decimal]:
        return [b.close for b in self.bars]

    @property
    def highs(self) -> List[Decimal]:
        return [b.high for b in self.bars]

    @property
    def lows(self) -> List[Decimal]:
        return [b.low for b in self.bars]

    @property
    def enabled(self) -> bool:
        return self._enabled

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    def reset(self) -> None:
        """清除歷史並重新初始化；切換回測標的時可用。"""
        self.bars.clear()
        self._initialized = False

    # ------------------------------------------------------------------ #
    # 序列化（給 Dashboard / 日誌使用）
    # ------------------------------------------------------------------ #
    def describe(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "symbol": self.symbol,
            "enabled": self._enabled,
            "params": self.params,
            "suitable_regimes": [r.value for r in self.suitable_regimes],
            "bars_loaded": len(self.bars),
        }

    def __repr__(self) -> str:
        return (
            f"<{self.name} symbol={self.symbol} "
            f"enabled={self._enabled} bars={len(self.bars)}>"
        )
