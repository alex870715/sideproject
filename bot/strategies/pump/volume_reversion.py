"""量能回檔反彈策略（VolumeReversion）— 抓「爆量急跌後的反彈」做均值回歸。

設計動機（依 edge 測試）：
- 在 1m 小幣上，「追爆量突破買進」往往買在最高點，進場後多數回落（負期望值）。
- 對稱地，爆量「急跌」過度乖離後，通常會反彈回均值。本策略反向吃這段回彈。
- 維持「只做多」：不放空，避開放空在 pump 行情被軋的偏態風險。

進場條件（同根 bar 全部成立才 BUY）：
  1. 量能爆衝（capitulation 量）：當根 vol > 近 `vol_lookback` 根 SMA × `vol_mult`。
  2. 過度乖離（oversold）：RSI(`rsi_period`) <= `rsi_oversold`。
  3. 急跌：當根收盤低於近 `drop_lookback` 根高點達 `min_drop_pct`（過度延伸）。
  4. 反轉確認：收盤站回 K 線上段（close 在 high-low 區間 >= `min_close_position`），
     代表賣壓衰竭、買盤承接（避免接還在直落的刀）。

出場一樣交給 PumpEngine + RiskMode（ATR 止損 / 保本 / 移動止損 / 續抱）。
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


class VolumeReversionStrategy(BaseStrategy):
    name = "VolumeReversion"
    pattern_key = "volume_reversion"
    suitable_regimes = [MarketRegime.RANGING, MarketRegime.HIGH_VOLATILITY]

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "vol_lookback": 20,
            "vol_mult": 3.0,
            "drop_lookback": 12,
            "min_drop_pct": 0.012,
            "rsi_period": 14,
            "rsi_oversold": 38.0,
            "min_close_position": 0.5,
            "cooldown_bars": 30,
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "vol_lookback": {
                "type": "int", "min": 5, "max": 200, "step": 1,
                "label": "Vol lookback",
                "tooltip": {
                    "zh-TW": "用近 N 根算成交量均值。越大越穩定、反應慢。",
                    "en": "Bars to average volume over. Larger = stabler, slower.",
                },
            },
            "vol_mult": {
                "type": "float", "min": 1.0, "max": 20.0, "step": 0.1,
                "label": "Vol multiplier",
                "tooltip": {
                    "zh-TW": "急跌時的爆量倍率：當根 vol > 均量 × N 才算 capitulation。",
                    "en": "Capitulation volume threshold: current vol > avg × N.",
                },
            },
            "drop_lookback": {
                "type": "int", "min": 3, "max": 100, "step": 1,
                "label": "Drop lookback",
                "tooltip": {
                    "zh-TW": "用近 N 根的高點當乖離基準，衡量目前跌得多深。",
                    "en": "Window high used as the reference to measure how deep the drop is.",
                },
            },
            "min_drop_pct": {
                "type": "float", "min": 0.0, "max": 0.5, "step": 0.001,
                "label": "Min drop pct",
                "tooltip": {
                    "zh-TW": "收盤須低於近期高點達此比例（過度延伸）。0.012 = 跌 1.2%。",
                    "en": "Close must be at least this far below the recent high. 0.012 = 1.2%.",
                },
            },
            "rsi_period": {
                "type": "int", "min": 2, "max": 100, "step": 1,
                "label": "RSI period",
                "tooltip": {
                    "zh-TW": "RSI 計算週期。",
                    "en": "RSI lookback period.",
                },
            },
            "rsi_oversold": {
                "type": "float", "min": 5.0, "max": 50.0, "step": 1.0,
                "label": "RSI oversold",
                "tooltip": {
                    "zh-TW": "RSI 低於此值才算超賣、允許進場。越低越嚴格。",
                    "en": "Only enter when RSI is below this (oversold). Lower = stricter.",
                },
            },
            "min_close_position": {
                "type": "float", "min": 0.0, "max": 1.0, "step": 0.05,
                "label": "Min close position",
                "tooltip": {
                    "zh-TW": "收盤須站回 K 線上段（賣壓衰竭、買盤承接）。0.5 = 收在中點以上。",
                    "en": "Close must reclaim the upper part of the bar (sellers exhausted). 0.5 = above midpoint.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 200, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {
                    "zh-TW": "觸發訊號後冷卻 N 根 bar 不再發。",
                    "en": "Bars to wait after a signal before firing again.",
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
        self.drop_lookback: int = int(self.params["drop_lookback"])
        self.min_drop_pct: float = float(self.params["min_drop_pct"])
        self.rsi_period: int = int(self.params["rsi_period"])
        self.rsi_oversold: float = float(self.params["rsi_oversold"])
        self.min_close_position: float = float(self.params["min_close_position"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])

        if self.vol_lookback < 5:
            raise ValueError("vol_lookback must be >= 5")
        if self.drop_lookback < 3:
            raise ValueError("drop_lookback must be >= 3")
        if self.vol_mult < 1.0:
            raise ValueError("vol_mult must be >= 1.0")

        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        need = max(self.vol_lookback, self.drop_lookback, self.rsi_period) + 2
        if len(self.bars) < need:
            return None

        sig = self._check_reversion_long(bar)
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

    def _check_reversion_long(self, bar: Bar) -> Optional[Signal]:
        # 1. 爆量
        vol_ratio = self._volume_spike(bar)
        if vol_ratio is None:
            return None

        # 2. 超賣（RSI）
        rsi_v = rsi(self.closes, self.rsi_period)
        if rsi_v is None or rsi_v > self.rsi_oversold:
            return None

        # 3. 過度乖離：收盤低於近期高點達門檻
        recent_highs = [b.high for b in self.bars[-self.drop_lookback - 1 : -1]]
        ref_high = max(recent_highs)
        if ref_high <= 0:
            return None
        drop_pct = float((ref_high - bar.close) / ref_high)
        if drop_pct < self.min_drop_pct:
            return None

        # 4. 反轉確認：收盤站回 K 線上段（賣壓衰竭）
        if bar.high > bar.low:
            close_pos = float((bar.close - bar.low) / (bar.high - bar.low))
            if close_pos < self.min_close_position:
                return None
        else:
            close_pos = 1.0

        # confidence：越超賣 + 量越大 + 承接越強 → 越高
        conf = min(
            1.0,
            (vol_ratio / (self.vol_mult * 2))
            * (1.0 + (self.rsi_oversold - rsi_v) / 50.0)
            * (0.5 + 0.5 * close_pos),
        )

        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=conf,
            reason=(
                f"VolReversion↩: vol={float(bar.volume):.0f} ({vol_ratio:.1f}× avg) "
                f"RSI={rsi_v:.0f} drop -{drop_pct*100:.2f}% reclaim={close_pos:.2f}"
            ),
            meta={
                "vol_ratio": vol_ratio,
                "rsi": rsi_v,
                "drop_pct": drop_pct,
                "close_pos": close_pos,
            },
        )
