"""布林通道均值回歸策略（Bollinger Bands Mean Reversion）。

邏輯：
- 計算 N 期均線（中軌）與 ±k 倍標準差（上/下軌）。
- 收盤跌破下軌 → BUY（預期均值回歸）。
- 收盤突破上軌 → SELL。
- 收盤回到中軌附近（上下緩衝區內）→ 平倉。
適用：橫盤震盪 / 低波動行情；單邊趨勢時容易被「貼著上/下軌跑」連續止損，
故 StrategyManager 在 `RANGING` 或 `LOW_VOLATILITY` 時才啟用。
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
from strategies.indicators import sma, stddev


class BollingerStrategy(BaseStrategy):
    name = "BollingerBands"
    suitable_regimes = [MarketRegime.RANGING, MarketRegime.LOW_VOLATILITY]

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        self.period: int = int(self.params.get("period", 20))
        self.std_mult: float = float(self.params.get("std_mult", 2.0))
        # 中軌「附近」的緩衝區（百分比；用於平倉判斷）
        self.exit_buffer: float = float(self.params.get("exit_buffer", 0.001))
        # 內部追蹤目前是否處於「持倉」邏輯狀態（True=long, False=short, None=flat）
        self._logical_long: Optional[bool] = None

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if len(self.bars) < self.period:
            return None

        mid = sma(self.closes, self.period)
        sd = stddev(self.closes, self.period)
        if mid is None or sd is None or sd == 0:
            return None

        upper = mid + self.std_mult * sd
        lower = mid - self.std_mult * sd
        close = float(bar.close)

        # 平倉：價格回到中軌附近
        if self._logical_long is True and close >= mid * (1 - self.exit_buffer):
            self._logical_long = None
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.CLOSE_LONG,
                price=bar.close,
                reason=f"Mean reversion done: close {close:.2f} ~ mid {mid:.2f}",
                meta={"mid": mid, "upper": upper, "lower": lower},
            )
        if self._logical_long is False and close <= mid * (1 + self.exit_buffer):
            self._logical_long = None
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.CLOSE_SHORT,
                price=bar.close,
                reason=f"Mean reversion done: close {close:.2f} ~ mid {mid:.2f}",
                meta={"mid": mid, "upper": upper, "lower": lower},
            )

        # 入場：觸及通道
        if close <= lower and self._logical_long is not True:
            self._logical_long = True
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.BUY,
                price=bar.close,
                reason=f"Touch lower band: close {close:.2f} <= lower {lower:.2f}",
                meta={"mid": mid, "upper": upper, "lower": lower},
            )
        if close >= upper and self._logical_long is not False:
            self._logical_long = False
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.SELL,
                price=bar.close,
                reason=f"Touch upper band: close {close:.2f} >= upper {upper:.2f}",
                meta={"mid": mid, "upper": upper, "lower": lower},
            )
        return None
