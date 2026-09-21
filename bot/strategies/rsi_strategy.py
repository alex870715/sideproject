"""RSI 超買超賣反彈策略。

邏輯：
- 計算 N 期 RSI（預設 14）。
- RSI 跌破 oversold（預設 30）→ BUY（捕捉超跌反彈）。
- RSI 衝破 overbought（預設 70）→ SELL（捕捉超買回落）。
- RSI 回到中性區（45~55）→ 平倉。
適用：短時間內出現極端走勢時切入，由 StrategyManager 在偵測到 RSI<25 或
RSI>75 的「極端動能」場景時啟用。
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
from strategies.indicators import rsi as rsi_indicator


class RSIStrategy(BaseStrategy):
    name = "RSI"
    suitable_regimes = [MarketRegime.HIGH_VOLATILITY, MarketRegime.BREAKOUT]

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        self.period: int = int(self.params.get("period", 14))
        self.oversold: float = float(self.params.get("oversold", 30))
        self.overbought: float = float(self.params.get("overbought", 70))
        self.exit_low: float = float(self.params.get("exit_low", 45))
        self.exit_high: float = float(self.params.get("exit_high", 55))
        self._logical_long: Optional[bool] = None

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if len(self.bars) < self.period + 1:
            return None

        value = rsi_indicator(self.closes, self.period)
        if value is None:
            return None

        # 平倉：RSI 回到中性區
        if self._logical_long is True and value >= self.exit_low:
            self._logical_long = None
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.CLOSE_LONG,
                price=bar.close,
                reason=f"RSI back to neutral: {value:.2f}",
                meta={"rsi": value},
            )
        if self._logical_long is False and value <= self.exit_high:
            self._logical_long = None
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.CLOSE_SHORT,
                price=bar.close,
                reason=f"RSI back to neutral: {value:.2f}",
                meta={"rsi": value},
            )

        # 入場：超賣 → 多；超買 → 空
        if value <= self.oversold and self._logical_long is not True:
            self._logical_long = True
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.BUY,
                price=bar.close,
                reason=f"Oversold: RSI={value:.2f} <= {self.oversold}",
                meta={"rsi": value},
            )
        if value >= self.overbought and self._logical_long is not False:
            self._logical_long = False
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.SELL,
                price=bar.close,
                reason=f"Overbought: RSI={value:.2f} >= {self.overbought}",
                meta={"rsi": value},
            )
        return None
