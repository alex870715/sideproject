"""風險模式（Risk Mode）— 為 Pump Engine 設計的「資金/槓桿/止損」預設組合。

設計動機：
- Pump 模式下，使用者想隨時切「保守 / 激進做多 / 最大槓桿」這類整套設定，
  而不是逐項微調「倉位比例 / 槓桿 / 止損 ATR 倍數」三個欄位。
- 把這些欄位封裝成一個值物件，前端只要送 `mode_key`，後端套用整組數值。

每個模式包含的欄位語意：
- `position_fraction`:   單筆開倉佔可用權益比例（例：0.05 = 5%）。
- `leverage`:            開倉槓桿（會在下單前對該 symbol 呼叫 set-leverage）。
- `td_mode`:             保證金模式：`cross` 全倉（共用帳戶保證金）或 `isolated` 逐倉（單筆爆倉不拖垮全帳）。
- `max_concurrent`:      投資組合最多同時持有幾個倉。
- `long_only`:           True = 不開空（小幣 pump 通常只做多）。
- `stop_atr_mult`:       初始止損 = entry - ATR × mult（多單）。
- `take_profit_r`:       第一段止盈 = R 倍報酬（風險為 ATR × stop_atr_mult）。
- `trail_atr_mult`:      移動止損 = max - ATR × mult。0 = 不啟用。
- `max_hold_bars`:       最多持倉 N 根 bar 後若仍未止盈強制平。0 = 不限制。

所有模式上限會被 `clamp_leverage(per_symbol_max)` 自動限制（OKX 不同 symbol
最大槓桿不同；Pump Engine 會把該 symbol 實際可用的 maxLever 傳進來）。
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from decimal import Decimal
from typing import Any, Dict, List


@dataclass
class RiskMode:
    key: str
    name: str
    description: str
    position_fraction: Decimal
    leverage: int
    max_concurrent: int
    td_mode: str = "isolated"          # cross | isolated — 預設逐倉，單筆爆倉不拖全帳
    long_only: bool = True
    stop_atr_mult: float = 2.0
    take_profit_r: float = 2.0
    trail_atr_mult: float = 1.5
    breakeven_at_r: float = 0.0      # 浮盈達 N×R 後把停損抬到進場價（保本）；0=關閉
    runner_after_tp: bool = False    # 達止盈不全平，改鎖利並讓移動停損續抱（讓利潤奔跑）
    max_hold_bars: int = 0
    reentry_cooldown_bars: int = 0   # 平倉後同 symbol 冷卻 N 根 bar 才允許再進
    min_signal_confidence: float = 0.0  # 訊號 confidence 低於此值不進場；0=不過濾
    short_stop_atr_mult: float = 0.0    # 0=沿用 stop_atr_mult
    short_take_profit_r: float = 0.0    # 0=沿用 take_profit_r
    short_max_hold_bars: int = 0        # 0=沿用 max_hold_bars
    short_exclude_majors: bool = False  # True=不對 BTC/ETH 等大幣開空
    alts_only: bool = False             # True=多單也不碰大幣，只交易小幣
    min_pump_score: float = 0.0         # pump_score 低於此值不進場；0=不過濾
    max_daily_loss_pct: float = 0.0     # 當日虧損達權益比例後停止開倉；0=關閉
    max_opens_per_day: int = 0          # 每日最多開倉次數；0=不限制
    is_preset: bool = True   # 預設 True；使用者新增的設 False，可以被刪 / 改

    def clamp_leverage(self, per_symbol_max: int) -> int:
        """OKX 不同 symbol 最大槓桿不同，套用實際上限；全倉另受 MAX_CROSS_LEVERAGE 限制。"""
        if per_symbol_max <= 0:
            cap = self._leverage_cap()
            return min(self.leverage, cap)
        return min(self.leverage, per_symbol_max, self._leverage_cap())

    def _leverage_cap(self) -> int:
        return MAX_CROSS_LEVERAGE if self.td_mode == "cross" else MAX_ALLOWED_LEVERAGE

    def short_stop_mult(self) -> float:
        return self.short_stop_atr_mult if self.short_stop_atr_mult > 0 else self.stop_atr_mult

    def short_tp_r(self) -> float:
        return self.short_take_profit_r if self.short_take_profit_r > 0 else self.take_profit_r

    def short_hold_bars(self) -> int:
        return self.short_max_hold_bars if self.short_max_hold_bars > 0 else self.max_hold_bars

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["position_fraction"] = float(self.position_fraction)
        return d


# 上限保護：全倉最高 25×；逐倉允許到 100×（拼爆擊策略用，風險自負）
MAX_ALLOWED_LEVERAGE = 100
MAX_CROSS_LEVERAGE = 25

# 全倉已停用：實盤全倉 + 高頻策略曾導致整戶保證金連鎖虧損
DISABLED_TD_MODES = frozenset({"cross"})
VALID_TD_MODES = frozenset({"isolated"})


# 可被使用者透過 UI / API 調整的欄位 + 邊界。其他欄位（key / name / description）
# 不開放編輯。每個欄位的 type 決定 coercion 與 UI 顯示型別。
# tooltip：滑鼠移上去顯示的說明（前端用 title 屬性顯示）。
EDITABLE_FIELDS: Dict[str, Dict[str, Any]] = {
    "leverage": {
        "type": "int", "min": 1, "max": MAX_ALLOWED_LEVERAGE, "step": 1,
        "label": "Leverage",
        "tooltip": {
            "zh-TW": f"開倉槓桿。全倉模式最高 {MAX_CROSS_LEVERAGE}×；逐倉模式最高 {MAX_ALLOWED_LEVERAGE}×。會被 OKX 各 symbol maxLever 再夾住。",
            "en": f"Open leverage. Cross max {MAX_CROSS_LEVERAGE}×; isolated max {MAX_ALLOWED_LEVERAGE}×. Also bounded by OKX per-symbol maxLever.",
        },
    },
    "td_mode": {
        "type": "enum",
        "choices": [
            {"value": "isolated", "label": "Isolated 逐倉"},
        ],
        "label": "Margin mode",
        "tooltip": {
            "zh-TW": "逐倉：每筆獨立保證金，爆倉只賠該筆，不會拖垮全帳。全倉模式已停用。",
            "en": "Isolated margin per position; liquidation only hits that trade. Cross mode disabled.",
        },
    },
    "position_fraction": {
        "type": "decimal", "min": 0.001, "max": 1.0, "step": 0.005,
        "label": "Position fraction",
        "tooltip": {
            "zh-TW": "單筆開倉佔可用權益的比例。0.10 = 10% equity 當保證金。名目倉位 = equity × fraction × leverage。",
            "en": "Margin fraction per entry. 0.10 = 10% of equity. Notional = equity × fraction × leverage.",
        },
    },
    "max_concurrent": {
        "type": "int", "min": 1, "max": 20, "step": 1,
        "label": "Max concurrent",
        "tooltip": {
            "zh-TW": "同時最多持有幾個倉。設小可降低相關性風險。",
            "en": "Max simultaneous positions. Lower = less correlation risk.",
        },
    },
    "long_only": {
        "type": "bool",
        "label": "Long only",
        "tooltip": {
            "zh-TW": "True=只做多（忽略 SELL 訊號）。False=允許策略 SELL 訊號開空；需搭配「激進多空」等模式。",
            "en": "True = long entries only (SELL signals ignored). False = allow short entries from strategy SELL signals.",
        },
    },
    "stop_atr_mult": {
        "type": "float", "min": 0.1, "max": 10.0, "step": 0.1,
        "label": "Stop (ATR×)",
        "tooltip": {
            "zh-TW": "初始停損 = entry − ATR × N。越大越寬鬆但虧損上限變大。",
            "en": "Initial stop = entry − ATR × N. Larger = wider stop, larger drawdown.",
        },
    },
    "take_profit_r": {
        "type": "float", "min": 0.1, "max": 20.0, "step": 0.1,
        "label": "Take profit (R)",
        "tooltip": {
            "zh-TW": "止盈 = R 倍風險。風險定義為 entry 到 stop 的距離。3.0 代表賺 3 倍停損距離就出場。",
            "en": "Take profit = R × risk, where risk is entry-to-stop distance. 3.0 means 3R reward target.",
        },
    },
    "trail_atr_mult": {
        "type": "float", "min": 0.0, "max": 10.0, "step": 0.1,
        "label": "Trail (ATR×, 0=off)",
        "tooltip": {
            "zh-TW": "移動停損 = max_close − ATR × N。0 = 不啟用；越小跟蹤越緊，越容易被洗。",
            "en": "Trailing stop = highest close − ATR × N. 0 disables. Smaller = tighter trail, more whipsaw.",
        },
    },
    "breakeven_at_r": {
        "type": "float", "min": 0.0, "max": 10.0, "step": 0.1,
        "label": "Breakeven at (R, 0=off)",
        "tooltip": {
            "zh-TW": "浮盈達 N 倍風險後，把停損抬到進場價保本。1.0 = 賺到 1R 就先確保不虧。0 = 關閉。",
            "en": "Once unrealized profit reaches N×R, raise stop to entry (breakeven). 1.0 locks no-loss at 1R. 0 = off.",
        },
    },
    "runner_after_tp": {
        "type": "bool",
        "label": "Let winners run after TP",
        "tooltip": {
            "zh-TW": "達止盈不立刻全平，改把停損鎖在止盈價、靠移動停損續抱，讓大趨勢單跑更遠。",
            "en": "At take-profit, don't fully close; lock the stop at the TP level and ride the trailing stop so big winners run further.",
        },
    },
    "max_hold_bars": {
        "type": "int", "min": 0, "max": 10000, "step": 1,
        "label": "Max hold bars (0=off)",
        "tooltip": {
            "zh-TW": "持倉最多 N 根 bar；超過自動平倉。0 = 不限。1m bar 下 60 = 1 小時。",
            "en": "Max bars to hold. Auto-flat after N bars. 0 = no limit. With 1m bars, 60 = 1 hour.",
        },
    },
    "reentry_cooldown_bars": {
        "type": "int", "min": 0, "max": 500, "step": 1,
        "label": "Re-entry cooldown (0=off)",
        "tooltip": {
            "zh-TW": "平倉後同 symbol 冷卻 N 根 bar 才允許再進，避免同一幣反覆洗單。1m bar 下 20 = 20 分鐘。",
            "en": "Bars to wait after closing before re-entering the same symbol. With 1m bars, 20 = 20 minutes.",
        },
    },
    "min_signal_confidence": {
        "type": "float", "min": 0.0, "max": 1.0, "step": 0.05,
        "label": "Min signal confidence",
        "tooltip": {
            "zh-TW": "策略訊號 confidence 低於此值不進場。0 = 不過濾；0.55 可過濾弱訊號。",
            "en": "Skip entries when signal confidence is below this. 0 = no filter; 0.55 filters weak signals.",
        },
    },
    "short_stop_atr_mult": {
        "type": "float", "min": 0.0, "max": 10.0, "step": 0.1,
        "label": "Short stop (ATR×, 0=same as long)",
        "tooltip": {
            "zh-TW": "空單止損 ATR 倍數。0 = 與多單相同。小幣 pump 環境建議空單更緊。",
            "en": "Short stop = entry + ATR × N. 0 uses long stop mult. Tighter shorts suit pump alts.",
        },
    },
    "short_take_profit_r": {
        "type": "float", "min": 0.0, "max": 20.0, "step": 0.1,
        "label": "Short TP (R, 0=same as long)",
        "tooltip": {
            "zh-TW": "空單止盈 R 倍。0 = 與多單相同。空單通常宜較快止盈。",
            "en": "Short take-profit in R multiples. 0 uses long TP. Shorts often need quicker exits.",
        },
    },
    "short_max_hold_bars": {
        "type": "int", "min": 0, "max": 10000, "step": 1,
        "label": "Short max hold (0=same as long)",
        "tooltip": {
            "zh-TW": "空單最多持倉 N 根 bar。0 = 與多單相同。",
            "en": "Max bars to hold a short. 0 uses long max_hold_bars.",
        },
    },
    "short_exclude_majors": {
        "type": "bool",
        "label": "No short on majors",
        "tooltip": {
            "zh-TW": "不對 BTC/ETH/SOL 等大幣開空；小幣起漲策略在大幣上做空勝率較差。",
            "en": "Skip short entries on major coins (BTC/ETH/SOL…); pump shorts work better on alts.",
        },
    },
    "alts_only": {
        "type": "bool",
        "label": "Alts only (no major longs)",
        "tooltip": {
            "zh-TW": "多單也只做小幣，不碰 BTC/ETH 等大幣；降低震盪盤洗損。",
            "en": "Long entries only on altcoins, skip BTC/ETH/SOL majors.",
        },
    },
    "min_pump_score": {
        "type": "float", "min": 0.0, "max": 100.0, "step": 1.0,
        "label": "Min pump score",
        "tooltip": {
            "zh-TW": "symbol 的 pump_score 低於此值不進場。30+ 可過濾弱候選。",
            "en": "Skip entry when symbol pump_score is below this. 30+ filters weak candidates.",
        },
    },
    "max_daily_loss_pct": {
        "type": "float", "min": 0.0, "max": 1.0, "step": 0.01,
        "label": "Daily loss halt (0=off)",
        "tooltip": {
            "zh-TW": "當日權益回撤達此比例後停止開新倉（仍管理既有倉）。0.05 = 5%。",
            "en": "Stop new entries when daily equity drawdown hits this ratio. 0.05 = 5%.",
        },
    },
    "max_opens_per_day": {
        "type": "int", "min": 0, "max": 500, "step": 1,
        "label": "Max opens per day (0=off)",
        "tooltip": {
            "zh-TW": "UTC 日內最多開幾次新倉，防止過度交易。",
            "en": "Max new positions opened per UTC day.",
        },
    },
}


PRESET_MODES: List[RiskMode] = [
    RiskMode(
        key="funding_reversion",
        name="Funding Reversion 資金費率反轉",
        description="搭配 FundingReversion：逐倉 2×、小倉位、寬止損、持有約一個 funding 週期（時間出場為主）。勝率約 36% 但贏大。",
        position_fraction=Decimal("0.02"),
        leverage=2,
        max_concurrent=4,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=6.0,       # 寬止損當災難保護（funding 反彈波動大）
        take_profit_r=3.0,       # 止盈拉很開 → 主要靠時間出場吃整個反彈
        trail_atr_mult=0.0,      # 不移動止損，抱滿 funding 週期
        breakeven_at_r=0.0,
        runner_after_tp=False,
        max_hold_bars=96,        # @5m = 8h ≈ 一個 funding 週期（主要出場）
        reentry_cooldown_bars=0, # 策略自帶 cooldown
        min_signal_confidence=0.0,
        alts_only=True,
        min_pump_score=0.0,      # funding 訊號的 pump_score 必為 0，不可開過濾
        max_daily_loss_pct=0.06,
        max_opens_per_day=12,
    ),
    RiskMode(
        key="pump_safe",
        name="Pump Safe 精選模式",
        description="預設：逐倉 2×、爆量回彈（均值回歸）、快進快出 1R 止盈、持有上限 60 根、日限 6 次。",
        position_fraction=Decimal("0.02"),
        leverage=2,
        max_concurrent=2,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=2.0,
        take_profit_r=1.0,
        trail_atr_mult=1.0,
        breakeven_at_r=0.0,
        runner_after_tp=False,
        max_hold_bars=60,
        reentry_cooldown_bars=60,
        min_signal_confidence=0.45,
        alts_only=True,
        min_pump_score=0.0,
        max_daily_loss_pct=0.05,
        max_opens_per_day=6,
    ),
    RiskMode(
        key="balanced",
        name="Balanced 標準模式",
        description="3× 逐倉、爆量回彈進場、快進快出 1R 止盈、日限 10 筆；攻守平衡。",
        position_fraction=Decimal("0.025"),
        leverage=3,
        max_concurrent=2,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=2.0,
        take_profit_r=1.0,
        trail_atr_mult=1.0,
        breakeven_at_r=0.0,
        runner_after_tp=False,
        max_hold_bars=60,
        reentry_cooldown_bars=45,
        min_signal_confidence=0.40,
        alts_only=True,
        min_pump_score=0.0,
        max_daily_loss_pct=0.06,
        max_opens_per_day=10,
    ),
    RiskMode(
        key="swing_short",
        name="Swing Short 短線波段",
        description=(
            "15m K 線、只做多小幣、緊管理：ATR2.5 停損 / 2.5R 止盈 / 0.5R 保本 / "
            "1.5×ATR 移動停利續抱；持有上限約 1 天（96 根）。搭配 HigherLow 進場。"
            "績效需以可重現回測重新驗證。"
        ),
        position_fraction=Decimal("0.10"),
        leverage=4,
        max_concurrent=3,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=2.5,
        take_profit_r=2.5,
        trail_atr_mult=1.5,
        breakeven_at_r=0.5,
        runner_after_tp=True,
        max_hold_bars=96,          # 15m × 96 = 24h
        reentry_cooldown_bars=12,
        min_signal_confidence=0.0,
        alts_only=True,            # 小幣 15m 波幅才蓋得過手續費（大幣不夠動）
        min_pump_score=0.0,
        max_daily_loss_pct=0.06,
        max_opens_per_day=0,
    ),
    RiskMode(
        key="swing_long", name="長線趨勢", description="4H 回踩，1 倍逐倉；未驗證績效。",
        position_fraction=Decimal("0.10"), leverage=1, max_concurrent=3,
        stop_atr_mult=3.0, take_profit_r=3.0, trail_atr_mult=2.5,
        max_hold_bars=180, reentry_cooldown_bars=6, max_daily_loss_pct=0.03,
    ),
    RiskMode(
        key="swing_mid",
        name="Swing Mid 中線波段",
        description=(
            "1H K 線、含大幣、順勢波段：ATR2.5 停損 / 2.5R 止盈 / 0.8R 保本 / "
            "2×ATR 移動停利續抱；持有數天~兩週（上限 240 根≈10 天）。搭配 HigherLow 進場。"
            "績效需以可重現回測重新驗證。"
        ),
        position_fraction=Decimal("0.10"),
        leverage=3,
        max_concurrent=4,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=2.5,
        take_profit_r=2.5,
        trail_atr_mult=2.0,
        breakeven_at_r=0.8,
        runner_after_tp=True,
        max_hold_bars=240,         # 1H × 240 = 10d
        reentry_cooldown_bars=6,
        min_signal_confidence=0.0,
        alts_only=False,           # 含大幣較穩健、分散
        min_pump_score=0.0,
        max_daily_loss_pct=0.10,
        max_opens_per_day=0,
    ),
    RiskMode(
        key="conservative",
        name="Conservative 保守",
        description="低槓桿、嚴 stop、雙向皆可；適合測試訊號品質。",
        position_fraction=Decimal("0.05"),
        leverage=2,
        max_concurrent=3,
        td_mode="isolated",
        long_only=False,
        stop_atr_mult=2.5,
        take_profit_r=2.0,
        trail_atr_mult=2.0,
        max_hold_bars=120,  # 1m bar = 2hr
    ),
    RiskMode(
        key="aggressive_long",
        name="Aggressive Long 激進做多",
        description="只做多、中等倉位、爆量回彈、1.2R 止盈快出；比保命模式積極，最多 3 倉。",
        position_fraction=Decimal("0.05"),
        leverage=5,
        max_concurrent=3,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=2.0,
        take_profit_r=1.2,
        trail_atr_mult=1.0,
        breakeven_at_r=0.0,
        runner_after_tp=False,
        max_hold_bars=60,
        reentry_cooldown_bars=20,
        min_signal_confidence=0.38,
        min_pump_score=0.0,
        max_opens_per_day=16,
    ),
    RiskMode(
        key="aggressive_long_short",
        name="Aggressive L/S 激進多空",
        description="⚠️ 高風險：多空雙向、交易頻繁。實盤易虧損，僅供回測/進階使用者。",
        position_fraction=Decimal("0.05"),
        leverage=5,
        max_concurrent=2,
        td_mode="isolated",
        long_only=False,
        stop_atr_mult=1.8,
        take_profit_r=2.5,
        trail_atr_mult=1.2,
        max_hold_bars=45,
        reentry_cooldown_bars=20,
        min_signal_confidence=0.55,
        short_exclude_majors=True,
    ),
    RiskMode(
        key="max_leverage",
        name="Max Leverage 最大槓桿",
        description="10× 逐倉、僅做多、緊湊 stop；高風險高報酬。",
        position_fraction=Decimal("0.03"),
        leverage=10,
        max_concurrent=3,
        td_mode="isolated",
        long_only=True,
        stop_atr_mult=1.2,
        take_profit_r=2.5,
        trail_atr_mult=1.0,
        max_hold_bars=30,
        max_opens_per_day=8,
    ),
    RiskMode(
        key="isolated_moonshot_50",
        name="Isolated 50× 逐倉爆擊",
        description="逐倉 50×；單筆爆倉不拖累全帳。小倉位、快進快出，適合強訊號拼波段。",
        position_fraction=Decimal("0.03"),
        leverage=50,
        max_concurrent=2,
        td_mode="isolated",
        long_only=False,
        stop_atr_mult=1.0,
        take_profit_r=3.0,
        trail_atr_mult=0.8,
        max_hold_bars=30,
    ),
    RiskMode(
        key="isolated_moonshot_100",
        name="Isolated 100× 逐倉極限",
        description="逐倉 100× 極限槓桿；僅限強訊號、極小倉位。爆倉 = 只賠該筆保證金。",
        position_fraction=Decimal("0.02"),
        leverage=100,
        max_concurrent=1,
        td_mode="isolated",
        long_only=False,
        stop_atr_mult=0.8,
        take_profit_r=4.0,
        trail_atr_mult=0.6,
        max_hold_bars=20,
    ),
]


# key → RiskMode 對照表（重複 key 會 raise）
def _build_registry() -> Dict[str, RiskMode]:
    reg: Dict[str, RiskMode] = {}
    for m in PRESET_MODES:
        if m.key in reg:
            raise ValueError(f"duplicated risk mode key: {m.key}")
        if m.leverage > m._leverage_cap():
            raise ValueError(
                f"risk mode {m.key} leverage {m.leverage} > cap for td_mode={m.td_mode}"
            )
        if m.td_mode in DISABLED_TD_MODES:
            raise ValueError(f"risk mode {m.key}: cross margin is disabled; use isolated")
        if m.td_mode not in VALID_TD_MODES:
            raise ValueError(f"risk mode {m.key} invalid td_mode: {m.td_mode}")
    reg = {m.key: m for m in PRESET_MODES}
    return reg


REGISTRY: Dict[str, RiskMode] = _build_registry()
PRESET_KEYS: set[str] = {m.key for m in PRESET_MODES}
DEFAULT_MODE_KEY = "pump_safe"


def get(key: str) -> RiskMode:
    if key not in REGISTRY:
        raise KeyError(f"unknown risk mode: {key}")
    return REGISTRY[key]


def list_all() -> List[Dict[str, Any]]:
    return [m.to_dict() for m in REGISTRY.values()]


def is_preset(key: str) -> bool:
    return key in PRESET_KEYS


def editable_fields_meta() -> Dict[str, Dict[str, Any]]:
    """前端用來 render input 的 meta（type / min / max / step / label / tooltip）。"""
    return {k: dict(v) for k, v in EDITABLE_FIELDS.items()}


def _validate_mode_coherence(rm: RiskMode) -> None:
    if rm.td_mode in DISABLED_TD_MODES:
        raise ValueError("全倉 (cross) 已停用，請改用 isolated 逐倉")
    if rm.td_mode not in VALID_TD_MODES:
        raise ValueError(f"td_mode must be cross or isolated, got {rm.td_mode!r}")
    cap = rm._leverage_cap()
    if rm.leverage > cap:
        raise ValueError(f"leverage {rm.leverage} > max {cap} for td_mode={rm.td_mode}")


def _coerce_and_validate(params: Dict[str, Any]) -> Dict[str, Any]:
    """根據 EDITABLE_FIELDS 把 params 轉型 + 邊界檢查，回傳新的 dict。
    任一欄位非法即 raise ValueError；先驗證再寫，呼叫端拿到結果再 setattr。
    """
    coerced: Dict[str, Any] = {}
    for field_name, value in params.items():
        if field_name not in EDITABLE_FIELDS:
            raise ValueError(f"non-editable risk mode field: {field_name}")
        spec = EDITABLE_FIELDS[field_name]
        ftype = spec["type"]
        try:
            if ftype == "bool":
                v: Any = value if isinstance(value, bool) else (
                    str(value).strip().lower() in ("true", "1", "yes", "on")
                )
            elif ftype == "int":
                v = int(value)
            elif ftype == "float":
                v = float(value)
            elif ftype == "decimal":
                v = Decimal(str(value))
            elif ftype == "enum":
                v = str(value).strip().lower()
                choices = {c["value"] for c in spec.get("choices", [])}
                if choices and v not in choices:
                    raise ValueError(f"{field_name}: invalid choice {v!r}")
            else:
                raise ValueError(f"unknown field type: {ftype}")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field_name}: cannot coerce {value!r} to {ftype} ({exc})")

        if "min" in spec:
            min_v = Decimal(str(spec["min"])) if isinstance(v, Decimal) else spec["min"]
            if v < min_v:
                raise ValueError(f"{field_name}={v} < min {spec['min']}")
        if "max" in spec:
            max_v = Decimal(str(spec["max"])) if isinstance(v, Decimal) else spec["max"]
            if v > max_v:
                raise ValueError(f"{field_name}={v} > max {spec['max']}")
        coerced[field_name] = v
    return coerced


def update(key: str, params: Dict[str, Any]) -> RiskMode:
    """partial update 某個 risk mode 的可編輯欄位。
    預設模式（is_preset=True）不允許修改，會 raise PermissionError。
    """
    rm = get(key)
    if rm.is_preset:
        raise PermissionError(f"risk mode '{key}' is a preset and cannot be modified")
    coerced = _coerce_and_validate(params)
    for k, v in coerced.items():
        setattr(rm, k, v)
    _validate_mode_coherence(rm)
    return rm


_KEY_PATTERN = __import__("re").compile(r"^[a-z][a-z0-9_]{1,31}$")


def add(
    key: str,
    name: str,
    base_key: str,
    description: str = "",
    overrides: Dict[str, Any] | None = None,
) -> RiskMode:
    """建立使用者自訂 risk mode：先複製 base_key 的全部欄位，再套用 overrides。

    - key:       唯一 key（小寫 / 數字 / 底線；2~32 字元）。不能與既有重複。
    - name:      顯示名稱（任意字串）。
    - base_key:  以哪個既有模式為基底；可以是預設或另一個自訂。
    - overrides: 可選；任何 EDITABLE_FIELDS 內的欄位都能蓋過。
    """
    if not _KEY_PATTERN.match(key or ""):
        raise ValueError("key must match ^[a-z][a-z0-9_]{1,31}$")
    if key in REGISTRY:
        raise ValueError(f"risk mode key already exists: {key}")
    if not name or not str(name).strip():
        raise ValueError("name must not be empty")
    base = get(base_key)

    coerced: Dict[str, Any] = _coerce_and_validate(overrides or {})

    new_mode = RiskMode(
        key=key,
        name=str(name).strip(),
        description=str(description or "").strip(),
        position_fraction=Decimal(base.position_fraction),
        leverage=base.leverage,
        max_concurrent=base.max_concurrent,
        td_mode=base.td_mode,
        long_only=base.long_only,
        stop_atr_mult=base.stop_atr_mult,
        take_profit_r=base.take_profit_r,
        trail_atr_mult=base.trail_atr_mult,
        breakeven_at_r=base.breakeven_at_r,
        runner_after_tp=base.runner_after_tp,
        max_hold_bars=base.max_hold_bars,
        reentry_cooldown_bars=base.reentry_cooldown_bars,
        min_signal_confidence=base.min_signal_confidence,
        short_stop_atr_mult=base.short_stop_atr_mult,
        short_take_profit_r=base.short_take_profit_r,
        short_max_hold_bars=base.short_max_hold_bars,
        short_exclude_majors=base.short_exclude_majors,
        alts_only=base.alts_only,
        min_pump_score=base.min_pump_score,
        max_daily_loss_pct=base.max_daily_loss_pct,
        max_opens_per_day=base.max_opens_per_day,
        is_preset=False,
    )
    for k, v in coerced.items():
        setattr(new_mode, k, v)
    _validate_mode_coherence(new_mode)
    REGISTRY[key] = new_mode
    return new_mode


def delete(key: str) -> None:
    """刪除使用者自訂 risk mode；預設不可刪。"""
    rm = get(key)
    if rm.is_preset:
        raise PermissionError(f"risk mode '{key}' is a preset and cannot be deleted")
    del REGISTRY[key]
