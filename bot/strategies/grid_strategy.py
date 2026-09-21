"""網格交易策略（Grid Trading）。

邏輯：
- 以「中心價」為基準，向上/向下以等比間距佈設 N 條網格線。
- 價格觸發某條「買格」→ 在該格 BUY 一份；觸發「賣格」→ SELL 一份。
- 每條網格只在「未持倉狀態」下被觸發一次；穿越上方賣格後，下次回到原買格才會再次觸發
  （避免單方向走勢時無限加倉）。
適用：寬幅震盪、無方向行情。中心價可由 StrategyManager 在進入此模式時動態給定
（取近 N 根 bar 的中位數），避免在趨勢中用舊中心價。
"""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, Optional

from strategies.base_strategy import (
    Bar,
    BaseStrategy,
    MarketRegime,
    Signal,
    SignalAction,
)


class GridStrategy(BaseStrategy):
    name = "Grid"
    suitable_regimes = [MarketRegime.RANGING, MarketRegime.UNKNOWN]

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        self.levels: int = int(self.params.get("levels", 5))            # 上下各幾格
        self.spacing_pct: float = float(self.params.get("spacing_pct", 0.01))  # 每格 1%
        self.center_price: Optional[float] = self.params.get("center_price")
        # 每條格線的「已被觸發」狀態：避免重複下單
        self._fired: Dict[int, bool] = {}
        self._last_idx: Optional[int] = None

    # ------------------------------------------------------------------ #
    def set_center(self, price: Decimal) -> None:
        """讓 StrategyManager 在啟用此策略時設定中心價。"""
        self.center_price = float(price)
        self._fired.clear()
        self._last_idx = None

    def _level_price(self, idx: int) -> float:
        """idx > 0 為上方賣格、idx < 0 為下方買格、idx = 0 為中心。"""
        return self.center_price * ((1.0 + self.spacing_pct) ** idx)  # type: ignore[operator]

    def _which_level(self, price: float) -> int:
        """回傳目前價格落在哪一格（最近的格線編號）。"""
        import math

        if not self.center_price:
            return 0
        ratio = price / self.center_price
        # log_(1+spacing)(ratio) 即是 idx
        idx = math.log(ratio) / math.log(1.0 + self.spacing_pct)
        # 取最近格
        rounded = int(round(idx))
        return max(-self.levels, min(self.levels, rounded))

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        # 第一次拿到 bar 自動以收盤價作為中心（StrategyManager 也可主動覆寫）
        if self.center_price is None:
            self.set_center(bar.close)
            return None

        idx = self._which_level(float(bar.close))

        # 第一根：只記錄初始格，不下單
        if self._last_idx is None:
            self._last_idx = idx
            return None

        # 跨越多格時用方向判斷一次性訊號（取最終格）
        if idx == self._last_idx:
            return None

        prev_idx = self._last_idx
        self._last_idx = idx

        # 向下：買進；向上：賣出。每條格線在被觸發後標記 fired，
        # 直到價格回到「相反方向」一次後才解除。
        if idx < prev_idx:  # 下跌：在買格 BUY
            level_idx = idx  # 已成交於目前格
            if not self._fired.get(level_idx, False):
                self._fired[level_idx] = True
                # 解除上方對稱賣格的 fired 標記，使其下次能再賣
                self._fired.pop(-level_idx, None)
                return Signal(
                    timestamp=bar.timestamp,
                    symbol=bar.symbol,
                    action=SignalAction.BUY,
                    price=bar.close,
                    reason=f"Grid hit BUY level {level_idx} @ {bar.close}",
                    meta={"level": level_idx, "center": self.center_price},
                )
        else:  # 上漲：在賣格 SELL
            level_idx = idx
            if not self._fired.get(level_idx, False):
                self._fired[level_idx] = True
                self._fired.pop(-level_idx, None)
                return Signal(
                    timestamp=bar.timestamp,
                    symbol=bar.symbol,
                    action=SignalAction.SELL,
                    price=bar.close,
                    reason=f"Grid hit SELL level {level_idx} @ {bar.close}",
                    meta={"level": level_idx, "center": self.center_price},
                )
        return None

    def reset(self) -> None:
        super().reset()
        self.center_price = None
        self._fired.clear()
        self._last_idx = None
