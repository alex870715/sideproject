"""量能爆發 + 高點突破策略（VolumeBreakout）— 抓「人買出量」的起漲訊號。

進場條件（同根 bar 全部成立才 BUY）：
  1. 當根 bar 的成交量 > 近 `vol_lookback` 根 bar 的 SMA × `vol_mult`
  2. 當根收盤價 > 近 `price_lookback` 根 bar 的最高點（不含當根本身）
  3. 收盤價漲幅（相對開盤）為正 — 過濾「量大但收陰」假突破

只發 BUY / SELL 進場訊號；出場交給 PumpEngine + RiskMode 統一管。
SELL 訊號僅在 RiskMode.long_only=False（如「激進多空」）時會被引擎執行。

參數預設值針對「1m bar 抓 1~5 分鐘級 pump」調過：
- vol_lookback=20, vol_mult=3.0, price_lookback=20
- min_close_pct=0.0  → 預設只要陽線即可

使用情境：
- 由 PumpEngine 為每個候選 symbol 維護一份此策略的實例（per-symbol bars）。
- 也能被掛在原 StrategyManager 上手動 override 用（單一 symbol 模式）。
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


class VolumeBreakoutStrategy(BaseStrategy):
    name = "VolumeBreakout"
    pattern_key = "volume_breakout"
    suitable_regimes = [MarketRegime.BREAKOUT, MarketRegime.TRENDING_UP]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "vol_lookback": 20,
            "vol_mult": 3.0,
            "price_lookback": 20,
            "min_close_pct": 0.005,
            "min_close_position": 0.55,
            "cooldown_bars": 30,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        """提供前端 render input 用的欄位說明（label + tooltip + min/max）。
        tooltip 是 {zh-TW, en} 雙語；UI 會挑當前語言顯示在 hover 上。
        """
        return {
            "vol_lookback": {
                "type": "int", "min": 5, "max": 200, "step": 1,
                "label": "Vol lookback",
                "tooltip": {
                    "zh-TW": "用近 N 根 bar 算成交量均值。越大越穩定但反應慢。最小 5。",
                    "en": "Bars used to compute average volume. Larger = stabler, slower. Min 5.",
                },
            },
            "vol_mult": {
                "type": "float", "min": 1.0, "max": 20.0, "step": 0.1,
                "label": "Vol multiplier",
                "tooltip": {
                    "zh-TW": "量爆倍率閾值。當前根 vol > 均量 × N 才視為量能爆發。3.0 是常見起點。",
                    "en": "Volume burst threshold. Trigger when current vol > avg × N. 3.0 is a typical baseline.",
                },
            },
            "price_lookback": {
                "type": "int", "min": 5, "max": 500, "step": 1,
                "label": "Price lookback",
                "tooltip": {
                    "zh-TW": "突破基準：當前收盤要 > 近 N 根的最高點（不含當根）。越大越保守。",
                    "en": "Breakout reference: close must exceed the highest high of last N bars (exclusive). Larger = more conservative.",
                },
            },
            "min_close_pct": {
                "type": "float", "min": 0.0, "max": 0.5, "step": 0.001,
                "label": "Min close pct",
                "tooltip": {
                    "zh-TW": "最低陽線漲幅 (close-open)/open。0.01 = 至少漲 1%，過濾假突破。",
                    "en": "Minimum bullish close pct (close-open)/open. 0.01 = at least +1%.",
                },
            },
            "min_close_position": {
                "type": "float", "min": 0.5, "max": 1.0, "step": 0.05,
                "label": "Min close position",
                "tooltip": {
                    "zh-TW": "收盤須在 K 線上段（型態確認）。0.65 = 收在 high-low 區間上方 65% 處，確保強勢收盤。",
                    "en": "Close must sit in the upper portion of the bar (pattern quality). 0.65 = upper 65% of range.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 200, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {
                    "zh-TW": "觸發訊號後冷卻 N 根 bar 不再發；防止連發。60 = 1 小時（1m bar）。",
                    "en": "Bars to wait after a signal. 60 = 1 hour on 1m bars.",
                },
            },
        }

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        defaults = self.default_params()
        for k, v in defaults.items():
            self.params.setdefault(k, v)
        self.vol_lookback: int = int(self.params["vol_lookback"])
        self.vol_mult: float = float(self.params["vol_mult"])
        self.price_lookback: int = int(self.params["price_lookback"])
        self.min_close_pct: float = float(self.params["min_close_pct"])
        self.min_close_position: float = float(self.params["min_close_position"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])

        if self.vol_lookback < 5:
            raise ValueError("vol_lookback must be >= 5")
        if self.price_lookback < 5:
            raise ValueError("price_lookback must be >= 5")
        if self.vol_mult < 1.0:
            raise ValueError("vol_mult must be >= 1.0")

        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        need = max(self.vol_lookback, self.price_lookback) + 2
        if len(self.bars) < need:
            return None

        sig = self._check_long_breakout(bar)
        if sig is not None:
            self._cooldown_left = self.cooldown_bars
        return sig

    def _volume_spike(self, bar: Bar) -> Optional[float]:
        recent_vols = [b.volume for b in self.bars[-self.vol_lookback - 1 : -1]]
        avg_vol = sma(recent_vols, self.vol_lookback)
        if avg_vol is None or avg_vol <= 0:
            return None
        cur_vol = float(bar.volume)
        if cur_vol < avg_vol * self.vol_mult:
            return None
        return cur_vol / avg_vol

    def _check_long_breakout(self, bar: Bar) -> Optional[Signal]:
        vol_ratio = self._volume_spike(bar)
        if vol_ratio is None:
            return None

        recent_highs = [b.high for b in self.bars[-self.price_lookback - 1 : -1]]
        prev_highest = max(recent_highs)
        if bar.close <= prev_highest:
            return None

        if bar.open > 0:
            close_pct = float((bar.close - bar.open) / bar.open)
            if close_pct < self.min_close_pct:
                return None
        else:
            close_pct = 0.0

        # 型態確認：收盤須在 K 線上段（強勢收盤，非上影線假突破）
        if bar.high > bar.low:
            close_pos = float((bar.close - bar.low) / (bar.high - bar.low))
            if close_pos < self.min_close_position:
                return None

        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=min(1.0, vol_ratio / (self.vol_mult * 2)),
            reason=(
                f"VolBreakout↑: vol={float(bar.volume):.0f} ({vol_ratio:.1f}× avg) "
                f"close>{prev_highest} (+{close_pct*100:.2f}%)"
            ),
            meta={"vol_ratio": vol_ratio, "prev_highest": float(prev_highest), "close_pct": close_pct},
        )

    def _check_short_breakout(self, bar: Bar) -> Optional[Signal]:
        vol_ratio = self._volume_spike(bar)
        if vol_ratio is None:
            return None

        recent_lows = [b.low for b in self.bars[-self.price_lookback - 1 : -1]]
        prev_lowest = min(recent_lows)
        if bar.close >= prev_lowest:
            return None

        if bar.open > 0:
            drop_pct = float((bar.open - bar.close) / bar.open)
            if drop_pct < self.min_close_pct:
                return None
        else:
            drop_pct = 0.0

        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.SELL,
            price=bar.close,
            confidence=min(1.0, vol_ratio / (self.vol_mult * 2)),
            reason=(
                f"VolBreakout↓: vol={float(bar.volume):.0f} ({vol_ratio:.1f}× avg) "
                f"close<{prev_lowest} (-{drop_pct*100:.2f}%)"
            ),
            meta={"vol_ratio": vol_ratio, "prev_lowest": float(prev_lowest), "drop_pct": drop_pct},
        )
