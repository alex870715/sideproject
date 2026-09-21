"""量能放大（VolumeSurge）— 成交量異常放大 + 陽線 + 收在均線上方。

跟 VolumeBreakout 的差異：
- VolumeBreakout 要求「突破近 N 根最高點」+ 大陽線（結構突破）。
- VolumeSurge 專注「量先起來」：量爆 + 當根收陽 + 站穩短期均線，適合起漲初段。

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


class VolumeSurgeStrategy(BaseStrategy):
    name = "VolumeSurge"
    pattern_key = "volume_surge"
    suitable_regimes = [MarketRegime.BREAKOUT, MarketRegime.TRENDING_UP]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "vol_lookback": 20,
            "vol_mult": 7.0,
            "min_body_pct": 0.003,
            "fast_ma": 10,
            "cooldown_bars": 35,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "vol_lookback": {
                "type": "int", "min": 5, "max": 200, "step": 1,
                "label": "Vol lookback",
                "tooltip": {
                    "zh-TW": "均量計算週期。",
                    "en": "Volume average lookback.",
                },
            },
            "vol_mult": {
                "type": "float", "min": 2.0, "max": 30.0, "step": 0.1,
                "label": "Vol multiplier",
                "tooltip": {
                    "zh-TW": "當根量須 > 均量 × N。7× 代表明顯放量。",
                    "en": "Current vol must exceed avg × N.",
                },
            },
            "min_body_pct": {
                "type": "float", "min": 0.0, "max": 0.1, "step": 0.001,
                "label": "Min body pct",
                "tooltip": {
                    "zh-TW": "最低陽線實體 (close-open)/open。",
                    "en": "Minimum bullish body size.",
                },
            },
            "fast_ma": {
                "type": "int", "min": 3, "max": 50, "step": 1,
                "label": "Fast MA",
                "tooltip": {
                    "zh-TW": "收盤須在短期均線上方。",
                    "en": "Close must be above short SMA.",
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
        self.vol_lookback: int = int(self.params["vol_lookback"])
        self.vol_mult: float = float(self.params["vol_mult"])
        self.min_body_pct: float = float(self.params["min_body_pct"])
        self.fast_ma: int = int(self.params["fast_ma"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])
        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        need = max(self.vol_lookback, self.fast_ma) + 2
        if len(self.bars) < need:
            return None

        recent_vols = [float(b.volume) for b in self.bars[-self.vol_lookback - 1 : -1]]
        avg_vol = sma(recent_vols, self.vol_lookback)
        if avg_vol is None or avg_vol <= 0:
            return None
        cur_vol = float(bar.volume)
        if cur_vol < avg_vol * self.vol_mult:
            return None
        vol_ratio = cur_vol / avg_vol

        if bar.open <= 0 or bar.close <= bar.open:
            return None
        body_pct = float((bar.close - bar.open) / bar.open)
        if body_pct < self.min_body_pct:
            return None

        ma_val = sma(self.closes, self.fast_ma)
        if ma_val is None or float(bar.close) <= ma_val:
            return None

        self._cooldown_left = self.cooldown_bars
        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=min(1.0, vol_ratio / (self.vol_mult * 1.5)),
            reason=(
                f"VolSurge: vol={cur_vol:.0f} ({vol_ratio:.1f}× avg) "
                f"body +{body_pct*100:.2f}% >MA{self.fast_ma}"
            ),
            meta={"vol_ratio": vol_ratio, "body_pct": body_pct, "ma": ma_val},
        )
