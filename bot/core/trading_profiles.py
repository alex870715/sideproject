"""使用者面向的「交易方案」— 一鍵切換風險模式 + 單一策略，避免雙軸設定困惑。"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# 每個方案固定：單策略 + 對應 risk mode
PROFILES: List[Dict[str, Any]] = [
    dict(id="swing_short", name_zh="短線波段", name_en="Short swing", icon="🌊", bar="15m", risk_mode="swing_short", strategy="HigherLow", desc_zh="15 分鐘順勢回踩，持倉上限 1 天。先測試交易成本與震盪行情的影響。", tags_zh=["15m", "回踩", "待驗證"], recommended=False),
    dict(id="swing_mid", name_zh="中線波段", name_en="Medium swing", icon="📈", bar="1H", risk_mode="swing_mid", strategy="HigherLow", desc_zh="1 小時順勢波段，持倉上限 10 天。趨勢反轉時可能連續停損。", tags_zh=["1H", "順勢", "待驗證"], recommended=False),
    dict(id="swing_long", name_zh="長線趨勢", name_en="Long trend", icon="🌿", bar="4H", risk_mode="swing_long", strategy="HigherLow", desc_zh="4 小時趨勢回踩，1 倍槓桿、持倉上限 30 天。長期持有仍承擔資金費率與回撤。", tags_zh=["4H", "1×", "待驗證"], recommended=False),
    dict(id="funding", name_zh="資金費率反轉", name_en="Funding", icon="🎯", bar="5m", risk_mode="funding_reversion", strategy="FundingReversion", desc_zh="極端負費率時尋找反彈；需要歷史費率才能驗證，不能以 K 線回測推定績效。", tags_zh=["市場結構", "需費率資料"], recommended=False),
    dict(id="reversion", name_zh="爆量回彈", name_en="Reversion", icon="⚖", risk_mode="balanced", strategy="VolumeReversion", desc_zh="急跌後尋找均值回歸，單邊下跌時容易持續虧損。", tags_zh=["均值回歸", "待驗證"], recommended=False),
    dict(id="active", name_zh="積極回彈", name_en="Active", icon="⚡", risk_mode="aggressive_long", strategy="VolumeReversion", desc_zh="較高槓桿與交易頻率，交易成本和回撤風險較高。", tags_zh=["高風險"], recommended=False),
]

for _profile in PROFILES:
    _profile.setdefault("desc_en", _profile["desc_zh"])
    _profile.setdefault("tags_en", _profile["tags_zh"])

_PROFILE_BY_ID = {p["id"]: p for p in PROFILES}


def get(profile_id: str) -> Dict[str, Any]:
    if profile_id not in _PROFILE_BY_ID:
        raise KeyError(f"unknown trading profile: {profile_id}")
    return _PROFILE_BY_ID[profile_id]


def list_all() -> List[Dict[str, Any]]:
    return list(PROFILES)


def detect(risk_mode_key: str, active_strategies: List[str]) -> str:
    """若目前設定完全符合某方案 → 回傳 profile id；否則 custom。"""
    if len(active_strategies) != 1:
        return "custom"
    strat = active_strategies[0]
    for p in PROFILES:
        if p["risk_mode"] == risk_mode_key and p["strategy"] == strat:
            return p["id"]
    return "custom"
