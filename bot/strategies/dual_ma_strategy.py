"""雙均線策略（Dual Moving Average Crossover）。

邏輯：
- 計算短期 SMA（預設 10）與長期 SMA（預設 30）。
- 短均線「向上穿越」長均線（黃金交叉）→ BUY。
- 短均線「向下穿越」長均線（死亡交叉）→ SELL。
- 持倉中遇到反向訊號 → 由 Engine 自動翻倉（先平再開）。
適用：單邊趨勢明顯的行情；橫盤時容易連續打臉，故由 StrategyManager 在
`MarketRegime.TRENDING_UP/DOWN` 時才啟用。
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from strategies.base_strategy import (
    Bar,
    BaseStrategy,
    MarketRegime,
    Signal,
    SignalAction,
)
from strategies.indicators import sma


class DualMAStrategy(BaseStrategy):
    name = "DualMA"
    suitable_regimes = [MarketRegime.TRENDING_UP, MarketRegime.TRENDING_DOWN]

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        self.short_period: int = int(self.params.get("short_period", 10))
        self.long_period: int = int(self.params.get("long_period", 30))
        if self.short_period >= self.long_period:
            raise ValueError("short_period must be < long_period")
        # 上一根 bar 的「短均線是否在長均線之上」，用來偵測穿越事件
        self._prev_short_above_long: Optional[bool] = None

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if len(self.bars) < self.long_period + 1:
            return None  # 預熱中

        short_ma = sma(self.closes, self.short_period)
        long_ma = sma(self.closes, self.long_period)
        if short_ma is None or long_ma is None:
            return None

        short_above_long = short_ma > long_ma
        prev = self._prev_short_above_long
        self._prev_short_above_long = short_above_long

        if prev is None:
            return None  # 第一次計算只記錄狀態，不產生訊號

        if not prev and short_above_long:
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.BUY,
                price=bar.close,
                reason=f"Golden cross: SMA{self.short_period}={short_ma:.2f} > SMA{self.long_period}={long_ma:.2f}",
                meta={"short_ma": short_ma, "long_ma": long_ma},
            )
        if prev and not short_above_long:
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.SELL,
                price=bar.close,
                reason=f"Death cross: SMA{self.short_period}={short_ma:.2f} < SMA{self.long_period}={long_ma:.2f}",
                meta={"short_ma": short_ma, "long_ma": long_ma},
            )
        return None
