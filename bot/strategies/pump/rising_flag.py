"""上升旗形（RisingFlag）— 急漲旗杆 + 窄幅整理 + 放量突破旗面上緣。

型態邏輯（1m bar）：
  1. 旗杆：pole_bars 根前曾急漲 ≥ pole_min_pct
  2. 旗面：接著 flag_bars 根橫盤，波動 < 旗杆波動 × flag_range_ratio
  3. 突破：當根收盤 > 旗面最高（不含當根），且量 > 均量 × vol_mult

只發 BUY；出場由 PumpEngine + RiskMode 管理。
"""

from __future__ import annotations

from decimal import Decimal
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


class RisingFlagStrategy(BaseStrategy):
    name = "RisingFlag"
    pattern_key = "rising_flag"
    suitable_regimes = [MarketRegime.BREAKOUT, MarketRegime.TRENDING_UP]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "pole_bars": 8,
            "pole_min_pct": 0.012,
            "flag_bars": 12,
            "flag_range_ratio": 0.45,
            "vol_lookback": 20,
            "vol_mult": 5.0,
            "cooldown_bars": 30,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "pole_bars": {
                "type": "int", "min": 3, "max": 50, "step": 1,
                "label": "Pole bars",
                "tooltip": {
                    "zh-TW": "旗杆長度（根 bar）。越短越敏感。",
                    "en": "Flagpole length in bars.",
                },
            },
            "pole_min_pct": {
                "type": "float", "min": 0.005, "max": 0.2, "step": 0.001,
                "label": "Pole min pct",
                "tooltip": {
                    "zh-TW": "旗杆最低漲幅（小數）。0.012 = 1.2%。",
                    "en": "Minimum flagpole rise (decimal). 0.012 = 1.2%.",
                },
            },
            "flag_bars": {
                "type": "int", "min": 5, "max": 60, "step": 1,
                "label": "Flag bars",
                "tooltip": {
                    "zh-TW": "旗面整理區間（根 bar）。",
                    "en": "Consolidation / flag length in bars.",
                },
            },
            "flag_range_ratio": {
                "type": "float", "min": 0.1, "max": 1.0, "step": 0.05,
                "label": "Flag range ratio",
                "tooltip": {
                    "zh-TW": "旗面波動須 < 旗杆波動 × 此比例，才算窄幅整理。",
                    "en": "Flag range must be narrower than pole range × this ratio.",
                },
            },
            "vol_lookback": {
                "type": "int", "min": 5, "max": 100, "step": 1,
                "label": "Vol lookback",
                "tooltip": {"zh-TW": "均量計算週期。", "en": "Volume average lookback."},
            },
            "vol_mult": {
                "type": "float", "min": 1.0, "max": 20.0, "step": 0.1,
                "label": "Vol multiplier",
                "tooltip": {
                    "zh-TW": "突破時成交量須 > 均量 × N。",
                    "en": "Breakout volume must exceed avg × N.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 200, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {"zh-TW": "觸發後冷卻 N 根 bar。", "en": "Cooldown after signal."},
            },
        }

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        defaults = self.default_params()
        for k, v in defaults.items():
            self.params.setdefault(k, v)
        self.pole_bars: int = int(self.params["pole_bars"])
        self.pole_min_pct: float = float(self.params["pole_min_pct"])
        self.flag_bars: int = int(self.params["flag_bars"])
        self.flag_range_ratio: float = float(self.params["flag_range_ratio"])
        self.vol_lookback: int = int(self.params["vol_lookback"])
        self.vol_mult: float = float(self.params["vol_mult"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])
        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        need = self.pole_bars + self.flag_bars + self.vol_lookback + 2
        if len(self.bars) < need:
            return None

        flag_slice = self.bars[-self.flag_bars - 1 : -1]
        pole_slice = self.bars[-self.flag_bars - self.pole_bars - 1 : -self.flag_bars - 1]
        if not flag_slice or not pole_slice:
            return None

        pole_start = float(pole_slice[0].close)
        pole_end = float(pole_slice[-1].close)
        if pole_start <= 0:
            return None
        pole_rise = (pole_end - pole_start) / pole_start
        if pole_rise < self.pole_min_pct:
            return None

        pole_high = max(float(b.high) for b in pole_slice)
        pole_low = min(float(b.low) for b in pole_slice)
        pole_range = pole_high - pole_low
        if pole_range <= 0:
            return None

        flag_high = max(float(b.high) for b in flag_slice)
        flag_low = min(float(b.low) for b in flag_slice)
        flag_range = flag_high - flag_low
        if flag_range > pole_range * self.flag_range_ratio:
            return None

        if flag_high > pole_high * 1.02:
            return None

        prev_flag_high = max(float(b.high) for b in flag_slice)
        if float(bar.close) <= prev_flag_high:
            return None

        recent_vols = [float(b.volume) for b in self.bars[-self.vol_lookback - 1 : -1]]
        avg_vol = sma(recent_vols, self.vol_lookback)
        if avg_vol is None or avg_vol <= 0:
            return None
        cur_vol = float(bar.volume)
        if cur_vol < avg_vol * self.vol_mult:
            return None
        vol_ratio = cur_vol / avg_vol

        self._cooldown_left = self.cooldown_bars
        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=min(1.0, pole_rise / (self.pole_min_pct * 2)),
            reason=(
                f"RisingFlag: pole +{pole_rise*100:.2f}% "
                f"break>{prev_flag_high:.4f} vol={vol_ratio:.1f}×"
            ),
            meta={
                "pole_rise": pole_rise,
                "flag_range": flag_range,
                "vol_ratio": vol_ratio,
            },
        )
