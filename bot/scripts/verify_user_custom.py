"""端到端驗證：使用者自訂策略 / risk mode + 預設保護 + tooltip metadata。

不依賴 OKX；用 stub broker / market / scanner，直接打 FastAPI app。
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, List
from unittest.mock import MagicMock

sys.path.insert(0, "/Users/alexchen870715/sideproject/bot")

from fastapi.testclient import TestClient

from core import risk_mode as rm
from core.pump_engine import PumpEngine
from webui.server import create_pump_app


def make_engine() -> PumpEngine:
    broker = MagicMock()
    market = MagicMock()
    scanner = MagicMock()
    eng = PumpEngine(broker=broker, market=market, scanner=scanner)
    return eng


def section(title: str) -> None:
    print(f"\n{'='*4} {title} {'='*(60-len(title))}")


def expect(cond: bool, msg: str) -> None:
    print(("[OK]   " if cond else "[FAIL] ") + msg)
    if not cond:
        sys.exit(1)


def main() -> None:
    # 為了乾淨測試：手動把上次跑剩的自訂模式清掉（fresh dict 也行）
    for k in [k for k in list(rm.REGISTRY) if not rm.REGISTRY[k].is_preset]:
        del rm.REGISTRY[k]

    eng = make_engine()
    app = create_pump_app(eng, tick_seconds=999)
    c = TestClient(app)

    section("HTML 頁面")
    r = c.get("/pump")
    expect(r.status_code == 200 and "Pump Bot" in r.text and "btn-new-rm" in r.text and "btn-new-strat" in r.text,
           "/pump 渲染含 + New 按鈕的新表單")

    section("strategies 預設帶 param_meta + is_preset")
    r = c.get("/api/pump/strategies").json()
    expect(set(r["presets"]) == {
        "VolumeBreakout", "VolumeSurge", "MomentumIgnition", "RisingFlag", "HigherLow",
    }, "presets 有五個內建起漲策略")
    by_name: Dict[str, Dict[str, Any]] = {x["name"]: x for x in r["strategies"]}
    vb = by_name["VolumeBreakout"]
    expect(vb["is_preset"] is True, "VolumeBreakout 是 preset")
    expect("vol_lookback" in vb["param_meta"], "param_meta 含 vol_lookback")
    expect("zh-TW" in vb["param_meta"]["vol_lookback"]["tooltip"]
           and "en" in vb["param_meta"]["vol_lookback"]["tooltip"],
           "vol_lookback tooltip 有 zh-TW / en")
    expect("pattern_icon" in vb and "<svg" in vb["pattern_icon"], "VolumeBreakout 有型態圖")

    section("risk-modes 預設帶 editable_fields + tooltip")
    r = c.get("/api/pump/risk-modes").json()
    expect(set(r["presets"]) >= {"conservative", "aggressive_long", "max_leverage", "isolated_moonshot_50"},
           "presets 含內建模式（含逐倉爆擊）")
    fields = r["editable_fields"]
    expect("td_mode" in fields and fields["td_mode"]["type"] == "enum",
           "editable_fields 含 td_mode enum")
    expect("zh-TW" in fields["leverage"]["tooltip"]
           and "en" in fields["leverage"]["tooltip"],
           "leverage tooltip 有 zh-TW / en")
    by_key = {m["key"]: m for m in r["modes"]}
    expect(by_key["aggressive_long"]["is_preset"] is True, "aggressive_long 是 preset")

    section("預設不可改 / 不可刪")
    r = c.post("/api/pump/risk-modes/aggressive_long/params", json={"params": {"leverage": 5}})
    expect(r.status_code == 403, f"改 preset risk mode 應 403，得到 {r.status_code} {r.text}")
    r = c.delete("/api/pump/risk-modes/aggressive_long")
    expect(r.status_code == 403, f"刪 preset risk mode 應 403，得到 {r.status_code}")
    r = c.post("/api/pump/strategies/VolumeBreakout/params", json={"params": {"vol_mult": 5.0}})
    expect(r.status_code == 403, f"改 preset strategy 應 403，得到 {r.status_code} {r.text}")
    r = c.delete("/api/pump/strategies/VolumeBreakout")
    expect(r.status_code == 403, f"刪 preset strategy 應 403，得到 {r.status_code}")

    section("建立使用者自訂 risk mode")
    r = c.post("/api/pump/risk-modes", json={
        "key": "my_yolo",
        "name": "My YOLO",
        "base_key": "max_leverage",
        "description": "personal max leverage tweak",
        "overrides": {"position_fraction": 0.02, "leverage": 20},
    })
    expect(r.status_code == 201, f"建立 risk mode 應 201，得到 {r.status_code} {r.text}")
    body = r.json()
    my = next(m for m in body["modes"] if m["key"] == "my_yolo")
    expect(my["is_preset"] is False, "my_yolo is_preset=False")
    expect(my["leverage"] == 20, f"my_yolo leverage=20，得到 {my['leverage']}")
    expect(abs(my["position_fraction"] - 0.02) < 1e-9, "my_yolo position_fraction=0.02")

    section("建立 invalid key 被擋")
    r = c.post("/api/pump/risk-modes", json={"key": "Bad-Key", "name": "x", "base_key": "conservative"})
    expect(r.status_code == 400 and "key" in r.json().get("detail", "").lower(),
           f"bad key 應 400，得到 {r.status_code} {r.text}")
    r = c.post("/api/pump/risk-modes", json={"key": "my_yolo", "name": "dup", "base_key": "conservative"})
    expect(r.status_code == 400, f"重複 key 應 400，得到 {r.status_code}")
    r = c.post("/api/pump/risk-modes", json={"key": "ok_key", "name": "x", "base_key": "no_such"})
    expect(r.status_code == 404, f"base_key 不存在應 404，得到 {r.status_code}")

    section("update 使用者自訂 risk mode")
    r = c.post("/api/pump/risk-modes/my_yolo/params", json={"params": {"leverage": 18, "stop_atr_mult": 1.0}})
    expect(r.status_code == 200, f"update 應 200，得到 {r.status_code} {r.text}")
    my = next(m for m in r.json()["modes"] if m["key"] == "my_yolo")
    expect(my["leverage"] == 18 and abs(my["stop_atr_mult"] - 1.0) < 1e-9, "update 套用成功")
    # 越界
    r = c.post("/api/pump/risk-modes/my_yolo/params", json={"params": {"leverage": 999}})
    expect(r.status_code == 400, f"越界 leverage 應 400，得到 {r.status_code}")
    r = c.post("/api/pump/risk-modes/my_yolo/params", json={"params": {"td_mode": "isolated", "leverage": 50}})
    expect(r.status_code == 200, f"逐倉 50x 應 200，得到 {r.status_code}")
    my = next(m for m in r.json()["modes"] if m["key"] == "my_yolo")
    expect(my["td_mode"] == "isolated" and my["leverage"] == 50, "td_mode isolated + 50x")
    r = c.post("/api/pump/risk-modes/my_yolo/params", json={"params": {"td_mode": "cross", "leverage": 50}})
    expect(r.status_code == 400, f"全倉 50x 應 400，得到 {r.status_code}")

    section("建立使用者自訂策略 + update + delete")
    r = c.post("/api/pump/strategies", json={
        "name": "MyVolBreak",
        "base": "VolumeBreakout",
        "description": "fast vol breakout",
        "params": {"vol_mult": 5.0, "cooldown_bars": 2},
    })
    expect(r.status_code == 201, f"建立 strategy 應 201，得到 {r.status_code} {r.text}")
    body = r.json()
    s = next(x for x in body["strategies"] if x["name"] == "MyVolBreak")
    expect(s["is_preset"] is False and s["base"] == "VolumeBreakout", "MyVolBreak base=VolumeBreakout")
    expect(s["current_params"]["vol_mult"] == 5.0
           and s["current_params"]["cooldown_bars"] == 2,
           "建立時 partial overrides 套用")

    r = c.post("/api/pump/strategies/MyVolBreak/params", json={"params": {"vol_mult": 4.0}})
    expect(r.status_code == 200, f"update strategy 應 200，得到 {r.status_code} {r.text}")
    s = next(x for x in r.json()["strategies"] if x["name"] == "MyVolBreak")
    expect(s["current_params"]["vol_mult"] == 4.0, "vol_mult 已改成 4.0")
    expect(s["current_params"]["cooldown_bars"] == 2, "其他參數保留")

    section("delete 自訂策略 / 模式")
    r = c.delete("/api/pump/strategies/MyVolBreak")
    expect(r.status_code == 200, f"delete strategy 應 200，得到 {r.status_code}")
    expect(all(x["name"] != "MyVolBreak" for x in r.json()["strategies"]), "MyVolBreak 已被移除")

    # 自訂如果是 active，不能刪
    eng.add_user_strategy("Active1", "VolumeBreakout")
    eng.set_active_strategy("Active1")
    r = c.delete("/api/pump/strategies/Active1")
    expect(r.status_code == 400, f"刪 active 自訂應 400，得到 {r.status_code} {r.text}")
    eng.set_active_strategy("VolumeBreakout")
    r = c.delete("/api/pump/strategies/Active1")
    expect(r.status_code == 200, "切回後可刪除")

    section("多策略同時啟用")
    r = c.post("/api/pump/strategies/active",
               json={"names": ["VolumeBreakout", "MomentumIgnition"]})
    expect(r.status_code == 200, f"設定多策略應 200，得到 {r.status_code} {r.text}")
    body = r.json()
    expect(body["active_list"] == ["VolumeBreakout", "MomentumIgnition"],
           f"active_list 應含兩策略，得到 {body.get('active_list')}")
    actives = {x["name"] for x in body["strategies"] if x["is_active"]}
    expect(actives == {"VolumeBreakout", "MomentumIgnition"}, "兩策略 is_active=True")

    # 透過 toggle 端點停用其一
    r = c.post("/api/pump/strategies/MomentumIgnition/active", json={"active": False})
    expect(r.status_code == 200 and r.json()["active_list"] == ["VolumeBreakout"],
           f"停用後只剩 VolumeBreakout，得到 {r.json().get('active_list')}")
    # 不能停用最後一個
    r = c.post("/api/pump/strategies/VolumeBreakout/active", json={"active": False})
    expect(r.status_code == 400, f"停用最後一個應 400，得到 {r.status_code}")
    # 重新啟用第二個
    r = c.post("/api/pump/strategies/MomentumIgnition/active", json={"active": True})
    expect(r.status_code == 200 and set(r.json()["active_list"]) == {"VolumeBreakout", "MomentumIgnition"},
           "重新啟用後兩策略都在")
    # 不存在的策略
    r = c.post("/api/pump/strategies/active", json={"names": ["NoSuch"]})
    expect(r.status_code == 404, f"未知策略應 404，得到 {r.status_code}")
    # 空集合
    r = c.post("/api/pump/strategies/active", json={"names": []})
    expect(r.status_code == 400, f"空集合應 400，得到 {r.status_code}")

    r = c.delete("/api/pump/risk-modes/my_yolo")
    expect(r.status_code == 200, f"delete risk mode 應 200，得到 {r.status_code}")
    expect(all(m["key"] != "my_yolo" for m in r.json()["modes"]), "my_yolo 已被移除")

    section("✅ 全部通過")


if __name__ == "__main__":
    main()
