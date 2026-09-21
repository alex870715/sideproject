"""動能加速策略（MomentumIgnition）— 抓「ROC 開始往上爆衝、RSI 從中性區躍起」的起漲。

進場條件（全部成立才 BUY）：
  1. ROC(roc_period) > `roc_threshold`（預設 1.5%）
  2. RSI(rsi_period) 上一根 < `rsi_low`（預設 50），當根 ≥ `rsi_high`（預設 60）
  3. 當根收盤 > 短期 SMA(`fast_ma`)（過濾「指標翻揚但價還在下方」假訊號）

只發 BUY / SELL 進場訊號；出場 / 止損由 PumpEngine + RiskMode 處理。

跟 VolumeBreakout 的區別：
- VolumeBreakout 看「量爆 + 高點突破」，是「結構面」訊號。
- MomentumIgnition 看「指標加速」，是「動能面」訊號。
- 兩者組合可以提高整體勝率（PumpEngine 之後可加多訊號融合）。
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
from strategies.indicators import rsi, sma
from strategies.pump.pattern_icons import get_pattern_icon


class MomentumIgnitionStrategy(BaseStrategy):
    name = "MomentumIgnition"
    pattern_key = "momentum_ignition"
    suitable_regimes = [MarketRegime.BREAKOUT, MarketRegime.TRENDING_UP]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "roc_period": 5,
            "roc_threshold": 0.028,
            "rsi_period": 14,
            "rsi_low": 45.0,
            "rsi_high": 68.0,
            "fast_ma": 12,
            "cooldown_bars": 50,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "roc_period": {
                "type": "int", "min": 1, "max": 100, "step": 1,
                "label": "ROC period",
                "tooltip": {
                    "zh-TW": "ROC 計算週期。越短越敏感（容易抓到也容易被噪音）。1m bar 下 5 = 5 分鐘。",
                    "en": "ROC lookback. Shorter = more sensitive but noisier. With 1m bars, 5 = 5 minutes.",
                },
            },
            "roc_threshold": {
                "type": "float", "min": 0.0, "max": 0.5, "step": 0.001,
                "label": "ROC threshold",
                "tooltip": {
                    "zh-TW": "ROC 閾值（小數）。0.015 = 1.5%。價格要在 roc_period 內漲幅至少這麼多才視為動能。",
                    "en": "ROC threshold (decimal). 0.015 = 1.5%. Price must rise at least this much in roc_period.",
                },
            },
            "rsi_period": {
                "type": "int", "min": 2, "max": 100, "step": 1,
                "label": "RSI period",
                "tooltip": {
                    "zh-TW": "RSI 計算週期。標準 14。",
                    "en": "RSI lookback. Standard is 14.",
                },
            },
            "rsi_low": {
                "type": "float", "min": 0.0, "max": 100.0, "step": 1.0,
                "label": "RSI low",
                "tooltip": {
                    "zh-TW": "上一根 RSI 必須低於此值（中性區）。預設 50；越低越嚴格。必須 < rsi_high。",
                    "en": "Previous bar's RSI must be below this (neutral). Default 50. Must be < rsi_high.",
                },
            },
            "rsi_high": {
                "type": "float", "min": 0.0, "max": 100.0, "step": 1.0,
                "label": "RSI high",
                "tooltip": {
                    "zh-TW": "當根 RSI 必須高於此值（已躍起）。預設 60；越高越嚴格。必須 > rsi_low。",
                    "en": "Current bar's RSI must be above this (already rising). Default 60. Must be > rsi_low.",
                },
            },
            "fast_ma": {
                "type": "int", "min": 1, "max": 200, "step": 1,
                "label": "Fast MA",
                "tooltip": {
                    "zh-TW": "短期 SMA 過濾：當前收盤必須在均線上方，避免抓到「指標翻揚但價在下」的假訊號。",
                    "en": "Short SMA filter: close must be above this MA to avoid 'indicator up but price down' false signals.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 100, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {
                    "zh-TW": "觸發訊號後冷卻 N 根 bar 不再發；防止連發。",
                    "en": "Bars to wait after a signal before firing again.",
                },
            },
        }

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        defaults = self.default_params()
        for k, v in defaults.items():
            self.params.setdefault(k, v)
        self.roc_period: int = int(self.params["roc_period"])
        self.roc_threshold: float = float(self.params["roc_threshold"])
        self.rsi_period: int = int(self.params["rsi_period"])
        self.rsi_low: float = float(self.params["rsi_low"])
        self.rsi_high: float = float(self.params["rsi_high"])
        self.fast_ma: int = int(self.params["fast_ma"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])

        if self.rsi_low >= self.rsi_high:
            raise ValueError("rsi_low must be < rsi_high")
        if self.roc_period < 1:
            raise ValueError("roc_period must be >= 1")

        self._prev_rsi: Optional[float] = None
        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        need = max(self.roc_period + 1, self.rsi_period + 2, self.fast_ma + 1)
        if len(self.bars) < need:
            return None

        # ROC：相對 N 根前的收盤
        ref_close = float(self.bars[-self.roc_period - 1].close)
        cur_close = float(bar.close)
        if ref_close <= 0:
            return None
        roc = (cur_close - ref_close) / ref_close

        # RSI
        rsi_val = rsi(self.closes, self.rsi_period)
        prev_rsi = self._prev_rsi
        self._prev_rsi = rsi_val

        if rsi_val is None or prev_rsi is None:
            return None

        # SMA 過濾
        ma_val = sma(self.closes, self.fast_ma)
        if ma_val is None:
            return None

        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        cond_roc_long = roc >= self.roc_threshold
        cond_rsi_long = (prev_rsi < self.rsi_low) and (rsi_val >= self.rsi_high)
        cond_ma_long = cur_close > ma_val

        if cond_roc_long and cond_rsi_long and cond_ma_long:
            self._cooldown_left = self.cooldown_bars
            return Signal(
                timestamp=bar.timestamp,
                symbol=bar.symbol,
                action=SignalAction.BUY,
                price=bar.close,
                confidence=min(1.0, roc / (self.roc_threshold * 2)),
                reason=(
                    f"Ignition↑: ROC{self.roc_period}={roc*100:.2f}% "
                    f"RSI {prev_rsi:.1f}→{rsi_val:.1f} close>{ma_val:.4f}"
                ),
                meta={"roc": roc, "rsi": rsi_val, "prev_rsi": prev_rsi, "fast_ma": ma_val},
            )

        return None
