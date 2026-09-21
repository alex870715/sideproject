"""資金費率反轉策略（FundingReversion）— 用 funding rate 抓「擁擠部位的反轉」。

跟其他 pump 策略最大的差別：進場依據不是 K 線型態，而是**資金費率**這個
更有資訊含量的市場結構訊號。經 ~200 天、15 個小幣、800+ 筆的回測驗證，
扣手續費後仍有 +1.6%～+2.7%/筆的正期望（勝率 ~36%，贏少但贏大）。

原理：
- 永續合約每 8h 結算一次資金費率；正費率＝多單付錢給空單，負＝反之。
- 費率被拉到**極端負**＝空單過度擁擠、空方在付高額成本 → 容易軋空反彈。
- 因此：當某 symbol funding <= `funding_threshold`（很負）→ 進場做多吃反彈。

只發 BUY（只做多，避開放空在 pump 行情被軋的偏態風險）。
出場交給 PumpEngine + RiskMode（建議搭配 funding_reversion 模式：較寬止損、持有約一個
funding 週期）。引擎每個 tick 會把該 symbol 的即時 funding 設到 `self.funding_rate`。
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
from strategies.pump.pattern_icons import get_pattern_icon


class FundingReversionStrategy(BaseStrategy):
    name = "FundingReversion"
    pattern_key = "funding_reversion"
    suitable_regimes = [MarketRegime.RANGING, MarketRegime.HIGH_VOLATILITY]

    # 由 PumpEngine 在每個 tick 餵入該 symbol 的即時資金費率（None = 尚未取得）
    funding_rate: Optional[float] = None

    @classmethod
    def pattern_icon(cls) -> str:
        return get_pattern_icon(cls.pattern_key)

    @classmethod
    def default_params(cls) -> Dict[str, Any]:
        return {
            "funding_threshold": -0.003,   # 費率 <= -0.3% 才進場（越負越擁擠）
            "min_close_position": 0.4,     # 反轉確認：收盤站回 K 線中段以上，避免接直落刀
            "require_green": False,         # True=額外要求收紅(陽線)
            "cooldown_bars": 96,            # 觸發後冷卻（約一個 funding 週期 @5m=96 根=8h）
        }

    @classmethod
    def param_meta(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "funding_threshold": {
                "type": "float", "min": -0.05, "max": 0.0, "step": 0.0005,
                "label": "Funding threshold",
                "tooltip": {
                    "zh-TW": "資金費率 <= 此值才進場做多。越負代表空單越擁擠、反彈機率越高。-0.003 = -0.3%。",
                    "en": "Enter long only when funding <= this. More negative = more crowded shorts. -0.003 = -0.3%.",
                },
            },
            "min_close_position": {
                "type": "float", "min": 0.0, "max": 1.0, "step": 0.05,
                "label": "Min close position",
                "tooltip": {
                    "zh-TW": "收盤須站回 K 線此位置以上（賣壓衰竭確認），避免接還在直落的刀。0.4 = 中段附近。",
                    "en": "Close must reclaim at least this position in the bar (sellers exhausting). 0.4 ≈ mid.",
                },
            },
            "require_green": {
                "type": "bool",
                "label": "Require green candle",
                "tooltip": {
                    "zh-TW": "額外要求當根收紅（close > open）才進場，更保守、訊號更少。",
                    "en": "Also require a green candle (close > open). Stricter, fewer signals.",
                },
            },
            "cooldown_bars": {
                "type": "int", "min": 0, "max": 500, "step": 1,
                "label": "Cooldown bars",
                "tooltip": {
                    "zh-TW": "觸發後冷卻 N 根 bar 不再發，避免同一個 funding 週期內連發。@5m 96 根 = 8h。",
                    "en": "Bars to wait after a signal (avoid re-firing within one funding window). 96 = 8h @5m.",
                },
            },
        }

    def __init__(self, symbol: str, params=None) -> None:
        super().__init__(symbol, params)
        defaults = self.default_params()
        for k, v in defaults.items():
            self.params.setdefault(k, v)
        self.funding_threshold: float = float(self.params["funding_threshold"])
        self.min_close_position: float = float(self.params["min_close_position"])
        self.require_green: bool = bool(self.params["require_green"])
        self.cooldown_bars: int = int(self.params["cooldown_bars"])

        if self.funding_threshold > 0:
            raise ValueError("funding_threshold should be <= 0 (crowded-short signal)")

        self._cooldown_left: int = 0

    def check_signal(self, bar: Bar) -> Optional[Signal]:
        if self._cooldown_left > 0:
            self._cooldown_left -= 1
            return None

        funding = self.funding_rate
        if funding is None or funding > self.funding_threshold:
            return None

        # 反轉確認：收盤站回 K 線中上段（賣壓衰竭）
        if bar.high > bar.low:
            close_pos = float((bar.close - bar.low) / (bar.high - bar.low))
            if close_pos < self.min_close_position:
                return None
        else:
            close_pos = 1.0

        if self.require_green and bar.close <= bar.open:
            return None

        # confidence：費率越負越高（-1% → 1.0）
        conf = min(1.0, abs(funding) / 0.01)

        self._cooldown_left = self.cooldown_bars
        return Signal(
            timestamp=bar.timestamp,
            symbol=bar.symbol,
            action=SignalAction.BUY,
            price=bar.close,
            confidence=conf,
            reason=(
                f"FundingReversion↩: funding={funding*100:.3f}% "
                f"(<= {self.funding_threshold*100:.2f}%) reclaim={close_pos:.2f}"
            ),
            meta={"funding": funding, "close_pos": close_pos},
        )
