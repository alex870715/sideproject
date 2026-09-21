"""小幣起漲（pump）系列策略 — 進場訊號；出場由 PumpEngine + RiskMode 管理。"""

from strategies.pump.funding_reversion import FundingReversionStrategy
from strategies.pump.higher_low import HigherLowStrategy
from strategies.pump.momentum_ignition import MomentumIgnitionStrategy
from strategies.pump.rising_flag import RisingFlagStrategy
from strategies.pump.volume_breakout import VolumeBreakoutStrategy
from strategies.pump.volume_reversion import VolumeReversionStrategy
from strategies.pump.volume_surge import VolumeSurgeStrategy

__all__ = [
    "FundingReversionStrategy",
    "HigherLowStrategy",
    "MomentumIgnitionStrategy",
    "RisingFlagStrategy",
    "VolumeBreakoutStrategy",
    "VolumeReversionStrategy",
    "VolumeSurgeStrategy",
    "PUMP_STRATEGY_REGISTRY",
    "STRATEGY_CATALOG",
    "list_pump_strategies",
]

PUMP_STRATEGY_REGISTRY = {
    "FundingReversion": FundingReversionStrategy,
    "VolumeReversion": VolumeReversionStrategy,
    "VolumeBreakout": VolumeBreakoutStrategy,
    "VolumeSurge": VolumeSurgeStrategy,
    "MomentumIgnition": MomentumIgnitionStrategy,
    "RisingFlag": RisingFlagStrategy,
    "HigherLow": HigherLowStrategy,
}

# 使用者看得懂的名稱與說明（UI 用）
STRATEGY_CATALOG: dict[str, dict] = {
    "FundingReversion": {
        "name_zh": "資金費率反轉",
        "name_en": "Funding Reversion",
        "tagline_zh": "資金費率極端負（空單擁擠）時做多吃軋空反彈，依市場結構而非 K 線",
        "tagline_en": "Long when funding is extremely negative (crowded shorts) — market structure, not candles",
        "recommended": True,
        "tier": "core",
    },
    "VolumeReversion": {
        "name_zh": "爆量回彈",
        "name_en": "Volume Reversion",
        "tagline_zh": "爆量急跌、超賣過度乖離後承接反彈（均值回歸）",
        "tagline_en": "Buy the bounce after a capitulation drop (mean reversion)",
        "recommended": False,
        "tier": "alt",
    },
    "VolumeBreakout": {
        "name_zh": "量爆突破",
        "name_en": "Volume Breakout",
        "tagline_zh": "放量突破前高 + 強勢收盤，確認型態才進場",
        "tagline_en": "Volume spike + breakout with strong close confirmation",
        "recommended": False,
        "tier": "alt",
    },
    "RisingFlag": {
        "name_zh": "上升旗形",
        "name_en": "Rising Flag",
        "tagline_zh": "急漲旗杆 → 整理 → 放量突破旗面",
        "tagline_en": "Pole → flag → volume breakout",
        "recommended": False,
        "tier": "alt",
    },
    "MomentumIgnition": {
        "name_zh": "動能點火",
        "name_en": "Momentum Ignition",
        "tagline_zh": "ROC 加速 + RSI 從中性區躍起",
        "tagline_en": "ROC surge + RSI ignition",
        "recommended": False,
        "tier": "alt",
    },
    "VolumeSurge": {
        "name_zh": "量能急增",
        "name_en": "Volume Surge",
        "tagline_zh": "量爆 + 站穩均線（較寬鬆，易多交易）",
        "tagline_en": "Volume surge above MA — more signals",
        "recommended": False,
        "tier": "alt",
    },
    "HigherLow": {
        "name_zh": "高低抬升",
        "name_en": "Higher Low",
        "tagline_zh": "結構性 higher low + 回踩 reclaim",
        "tagline_en": "Higher-low structure + reclaim",
        "recommended": False,
        "tier": "alt",
    },
}


def strategy_catalog(name: str) -> dict:
    base = STRATEGY_CATALOG.get(name, {})
    return {
        "name_zh": base.get("name_zh", name),
        "name_en": base.get("name_en", name),
        "tagline_zh": base.get("tagline_zh", ""),
        "tagline_en": base.get("tagline_en", ""),
        "recommended": base.get("recommended", False),
        "tier": base.get("tier", "alt"),
    }


def list_pump_strategies() -> list[dict]:
    return [
        {
            "name": name,
            "default_params": cls.default_params(),
            "description": cls.__doc__.split("\n")[0] if cls.__doc__ else "",
            "pattern_icon": cls.pattern_icon() if hasattr(cls, "pattern_icon") else "",
            **strategy_catalog(name),
        }
        for name, cls in PUMP_STRATEGY_REGISTRY.items()
    ]
