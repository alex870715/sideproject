"""高點抬高（HigherLow）— 上升趨勢中回踩不破前低 + 再度走強。

邏輯：
  1. 近 lookback 根形成 higher low（當前 low > 前一段 low）
  2. 收盤重新站上 fast_ma
  3. 近 3 根至少 2 根收陽

只發 BUY。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from strategies.base_strategy import (
    Bar,
    BaseStrategy,
    MarketRegime,
    Signal,
    SignalAction,
)
from strategies.indicators import sma
from strategies.pump.pattern_icons import get_pattern_icon


class HigherLowStrategy(BaseStrategy):
    name = "HigherLow"
    pattern_key = "higher_low"
    suitable_regimes = [MarketRegime.TRENDING_UP, MarketRegime.BREAKOUT]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        # 回測（15m×14d / 1H×45d）驗證出的順勢波段參數：較長的 swing 結構、
        # 站上 MA20、至少回踩 1.2% 才進場（避免追高），冷卻 12 根。
        return {
            "swing_bars": 24,
            "fast_ma": 20,
            "trend_ma": 60,
            "min_pullback_pct": 0.012,
            "cooldown_bars": 12,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "trend_ma": {
                "type": "int", "min": 30, "max": 120, "step": 1,
                "label": "Trend MA",
                "tooltip": {"zh-TW": "趨勢均線週期；價格須站上且均線向上，降低下跌中接刀。", "en": "Require price above a rising trend average."},
            },
            "swing_bars": {
                "type": "int", "min": 8, "max": 80, "step": 1,
                "label": "Swing lookback",
                "tooltip": {
                    "zh-TW": "尋找前低 / 現低結構的回看週期。",
                    "en": "Lookback for swing low structure.",
                },
            },
            "fast_ma": {
                "type": "int", "min": 3, "max": 50, "step": 1,
                "label": "Fast MA",
                "tooltip": {"zh-TW": "收盤須重新站上均線。", "en": "Close must reclaim SMA."},
            },
            "min_pullback_pct": {
                "type": "float", "min": 0.0, "max": 0.05, "step": 0.001,
                "label": "Min pullback pct",
                "tooltip": {
                    "zh-TW": "從近期高點至少回踩此比例，避免追在最高點。",
                    "en": "Minimum pullback from recent high.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 200, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {"zh-TW": "冷卻 bar 數。", "en": "Cooldown bars."},
            },
        }

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        defaults = self.default_params()
        for k, v in defaults.items():
            self.params.setdefault(k, v)
        self.swing_bars: int = int(self.params["swing_bars"])
        self.fast_ma: int = int(self.params["fast_ma"])
        self.trend_ma: int = int(self.params["trend_ma"])
        self.min_pullback_pct: float = float(self.params["min_pullback_pct"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])
        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        need = max(self.swing_bars + self.fast_ma + 2, self.trend_ma + 1)
        if len(self.bars) < need:
            return None

        trend = sma(self.closes, self.trend_ma)
        prior_trend = sma(self.closes[:-1], self.trend_ma)
        if trend is None or prior_trend is None or trend <= prior_trend or float(bar.close) <= trend:
            return None

        window = self.bars[-self.swing_bars - 1 : -1]
        if len(window) < self.swing_bars:
            return None

        mid = len(window) // 2
        first_half = window[:mid]
        second_half = window[mid:]
        if not first_half or not second_half:
            return None

        prev_low = min(float(b.low) for b in first_half)
        recent_low = min(float(b.low) for b in second_half)
        if recent_low <= prev_low:
            return None

        recent_high = max(float(b.high) for b in window)
        if recent_high <= 0:
            return None
        pullback = (recent_high - float(bar.close)) / recent_high
        if pullback < self.min_pullback_pct:
            return None

        ma_val = sma(self.closes, self.fast_ma)
        if ma_val is None or float(bar.close) <= ma_val:
            return None

        last3 = self.bars[-3:]
        green = sum(1 for b in last3 if b.close > b.open)
        if green < 2:
            return None

        self._cooldown_left = self.cooldown_bars
        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=min(1.0, (recent_low - prev_low) / prev_low * 50 if prev_low else 0.5),
            reason=(
                f"HigherLow: low {prev_low:.4f}→{recent_low:.4f} "
                f"reclaim MA{self.fast_ma} pull={pullback*100:.2f}%"
            ),
            meta={"prev_low": prev_low, "recent_low": recent_low, "pullback": pullback},
        )
