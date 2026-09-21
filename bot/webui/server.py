"""FastAPI Web Server。

- 在背景以 asyncio Task 跑 engine 主迴圈。
- 每根 bar 結束後將 `engine.state_snapshot()` + 近期 K 線 + 近期事件
  序列化成 JSON，broadcast 給所有 WS 連線。
- 前端是單頁 HTML（webui/static/index.html），透過 `/ws` 取得即時資料。

設計重點：
- engine 與 market 都不認識 web；web 只是 dashboard 的另一種輸出形式。
- next_bar() 與 on_bar() 都是同步方法，但用 `asyncio.to_thread` 包起來，
  即使 OKXMarket 那種會阻塞 I/O 的數據源也不會卡住 event loop。
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.engine import TradingEngine
from strategies.base_strategy import Bar


class SetActiveBody(BaseModel):
    name: Optional[str] = None  # None 表示釋放手動 override


class UpdateParamsBody(BaseModel):
    params: Dict[str, Any]


STATIC_DIR = Path(__file__).parent / "static"


def _json_default(o: Any) -> Any:
    if isinstance(o, Decimal):
        return float(o)
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def serialize(engine: TradingEngine, bars: List[Bar], bar_count: int) -> str:
    payload = {
        "bar_count": bar_count,
        "state": engine.state_snapshot(),
        "price_history": [
            {
                "t": b.timestamp.isoformat(),
                "o": float(b.open),
                "h": float(b.high),
                "l": float(b.low),
                "c": float(b.close),
            }
            for b in bars
        ],
        "events": [
            {
                "t": e.timestamp.isoformat(),
                "level": e.level.value,
                "msg": e.message,
            }
            for e in engine.events
        ],
    }
    return json.dumps(payload, default=_json_default)


# ---------------------------------------------------------------------- #
# Connection Manager
# ---------------------------------------------------------------------- #
class ConnectionManager:
    def __init__(self) -> None:
        self._active: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._active.append(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            if ws in self._active:
                self._active.remove(ws)

    async def broadcast(self, text: str) -> None:
        async with self._lock:
            targets = list(self._active)
        dead: List[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self._active:
                        self._active.remove(ws)

    @property
    def count(self) -> int:
        return len(self._active)


# ---------------------------------------------------------------------- #
# App factory
# ---------------------------------------------------------------------- #
def create_app(
    engine: TradingEngine,
    market: Any,
    speed: float = 0.1,
    bars_limit: int = 0,
    history_size: int = 200,
) -> FastAPI:
    """把 engine + market 包成 FastAPI app。

    Args:
        speed:       每根 bar 之間 sleep 秒數；OKX 真實市場可設 0（自然由 next_bar 阻塞控速）。
        bars_limit:  跑幾根 bar 後停；0 = 不限制。
        history_size: K 線圖最多保留幾根 bar。
    """
    manager = ConnectionManager()
    bars: List[Bar] = []
    state = {"bar_count": 0, "running": True}

    async def engine_loop() -> None:
        bar_count = 0
        try:
            while state["running"] and (bars_limit == 0 or bar_count < bars_limit):
                bar = await asyncio.to_thread(market.next_bar)
                if bar is None:
                    break
                await asyncio.to_thread(engine.on_bar, bar)
                bar_count += 1
                state["bar_count"] = bar_count
                bars.append(bar)
                if len(bars) > history_size:
                    del bars[0 : len(bars) - history_size]

                await manager.broadcast(serialize(engine, bars, bar_count))
                if speed > 0:
                    await asyncio.sleep(speed)
        except asyncio.CancelledError:
            raise
        finally:
            state["running"] = False

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(engine_loop())
        try:
            yield
        finally:
            state["running"] = False
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    app = FastAPI(lifespan=lifespan, title="Crypto Trading Bot")

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> str:
        index_path = STATIC_DIR / "index.html"
        if index_path.exists():
            return index_path.read_text(encoding="utf-8")
        return "<h1>index.html not found</h1>"

    @app.get("/api/state")
    async def get_state() -> dict:
        return json.loads(serialize(engine, bars, state["bar_count"]))

    @app.get("/api/strategies")
    async def list_strategies() -> dict:
        return await asyncio.to_thread(engine.list_strategies)

    @app.post("/api/strategy/active")
    async def set_active(body: SetActiveBody) -> dict:
        try:
            return await asyncio.to_thread(engine.set_active_strategy, body.name)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/strategies/{name}/params")
    async def update_strategy_params(name: str, body: UpdateParamsBody) -> dict:
        try:
            return await asyncio.to_thread(
                engine.update_strategy_params, name, body.params
            )
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(e))

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        try:
            await websocket.send_text(serialize(engine, bars, state["bar_count"]))
            while True:
                # 我們不期望前端送資料，但 receive_text 可偵測斷線
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket)

    return app


# ---------------------------------------------------------------------- #
# Pump Mode 的 FastAPI app（多 symbol 抓小幣起漲）
# ---------------------------------------------------------------------- #
class SetPumpStrategyBody(BaseModel):
    name: str


class SetActiveStrategiesBody(BaseModel):
    names: List[str]


class ToggleStrategyBody(BaseModel):
    active: bool


class SetRiskModeBody(BaseModel):
    key: str


class SetTradingProfileBody(BaseModel):
    id: str


class PumpUpdateParamsBody(BaseModel):
    params: Dict[str, Any]


class CreateUserStrategyBody(BaseModel):
    name: str
    base: str
    description: Optional[str] = ""
    params: Optional[Dict[str, Any]] = None


class CreateUserRiskModeBody(BaseModel):
    key: str
    name: str
    base_key: str
    description: Optional[str] = ""
    overrides: Optional[Dict[str, Any]] = None


def _serialize_pump(engine: Any) -> str:
    snap = engine.snapshot()
    payload = {
        "state": snap,
        "events": [
            {
                "t": e.timestamp.isoformat(),
                "level": e.level.value,
                "msg": e.message,
            }
            for e in engine.events
        ],
    }
    return json.dumps(payload, default=_json_default)


def create_pump_app(engine: Any, tick_seconds: float = 10.0) -> FastAPI:
    """把 PumpEngine 包成 FastAPI app；UI 透過 /pump 取得頁面。"""
    manager = ConnectionManager()
    state = {"running": True, "tick_count": 0}

    async def engine_loop() -> None:
        try:
            while state["running"]:
                await asyncio.to_thread(engine.tick)
                state["tick_count"] += 1
                await manager.broadcast(_serialize_pump(engine))
                await asyncio.sleep(tick_seconds)
        except asyncio.CancelledError:
            raise
        finally:
            state["running"] = False

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(engine_loop())
        try:
            yield
        finally:
            state["running"] = False
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    app = FastAPI(lifespan=lifespan, title="Crypto Pump Bot")
    from webui.research_api import install_research
    install_research(app)

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", response_class=HTMLResponse)
    async def index() -> str:
        # 直接導到 /pump
        return (
            '<!DOCTYPE html><meta charset="utf-8">'
            '<meta http-equiv="refresh" content="0; url=/pump">'
            '<a href="/pump">/pump</a>'
        )

    @app.get("/pump", response_class=HTMLResponse)
    async def pump_index() -> str:
        index_path = STATIC_DIR / "pump.html"
        if index_path.exists():
            return index_path.read_text(encoding="utf-8")
        return "<h1>pump.html not found</h1>"

    @app.get("/api/pump/state")
    async def get_state() -> dict:
        return json.loads(_serialize_pump(engine))

    @app.get("/api/pump/strategies")
    async def list_pump_strategies_api() -> dict:
        return await asyncio.to_thread(engine.list_strategies)

    @app.get("/api/pump/risk-modes")
    async def list_risk_modes_api() -> dict:
        return await asyncio.to_thread(engine.list_risk_modes)

    @app.post("/api/pump/strategy")
    async def set_pump_strategy(body: SetPumpStrategyBody) -> dict:
        try:
            return await asyncio.to_thread(engine.set_active_strategy, body.name)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/strategies/active")
    async def set_active_strategies(body: SetActiveStrategiesBody) -> dict:
        """設定「同時啟用」的多個策略（取代整個 active 集合）。"""
        try:
            return await asyncio.to_thread(engine.set_active_strategies, body.names)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/strategies/{name}/active")
    async def toggle_strategy(name: str, body: ToggleStrategyBody) -> dict:
        """啟用 / 停用單一策略，其餘維持不變。"""
        try:
            return await asyncio.to_thread(engine.set_strategy_active, name, body.active)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.get("/api/pump/profiles")
    async def list_trading_profiles_api() -> dict:
        return await asyncio.to_thread(engine.list_trading_profiles)

    @app.post("/api/pump/profile")
    async def set_trading_profile_api(body: SetTradingProfileBody) -> dict:
        try:
            return await asyncio.to_thread(engine.set_trading_profile, body.id)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/risk-mode")
    async def set_risk_mode(body: SetRiskModeBody) -> dict:
        try:
            return await asyncio.to_thread(engine.set_risk_mode, body.key)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/positions/{symbol}/close")
    async def close_position_api(symbol: str) -> dict:
        try:
            return await asyncio.to_thread(engine.force_close, symbol)
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/pump/positions/close-all")
    async def close_all_api() -> dict:
        try:
            return await asyncio.to_thread(engine.close_all)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/pump/strategies/{name}/params")
    async def update_pump_strategy_params(
        name: str, body: PumpUpdateParamsBody
    ) -> dict:
        try:
            return await asyncio.to_thread(
                engine.update_strategy_params, name, body.params
            )
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/risk-modes/{key}/params")
    async def update_risk_mode_params_api(
        key: str, body: PumpUpdateParamsBody
    ) -> dict:
        try:
            return await asyncio.to_thread(
                engine.update_risk_mode_params, key, body.params
            )
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    # 動態增刪：使用者自訂策略 / 風險模式 ----------------------------------- #
    @app.post("/api/pump/strategies", status_code=201)
    async def create_user_strategy_api(body: CreateUserStrategyBody) -> dict:
        try:
            return await asyncio.to_thread(
                engine.add_user_strategy,
                body.name, body.base, body.params, body.description or "",
            )
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.delete("/api/pump/strategies/{name}")
    async def delete_user_strategy_api(name: str) -> dict:
        try:
            return await asyncio.to_thread(engine.delete_user_strategy, name)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/pump/risk-modes", status_code=201)
    async def create_user_risk_mode_api(body: CreateUserRiskModeBody) -> dict:
        try:
            return await asyncio.to_thread(
                engine.add_user_risk_mode,
                body.key, body.name, body.base_key,
                body.description or "", body.overrides,
            )
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.delete("/api/pump/risk-modes/{key}")
    async def delete_user_risk_mode_api(key: str) -> dict:
        try:
            return await asyncio.to_thread(engine.delete_user_risk_mode, key)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        await manager.connect(ws)
        try:
            await ws.send_text(_serialize_pump(engine))
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(ws)

    return app
