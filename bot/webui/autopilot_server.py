"""Local integrated UI + demo trader. python -m webui.autopilot_server"""
from __future__ import annotations

import asyncio
import fcntl
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

from core.autopilot_policy import AutoConfig, catalog
from core.demo_autopilot import DemoAutopilot, configured_client, STORE
from webui.research_api import install_research
from webui.access import Access


class EmptyBody(BaseModel):
    model_config=ConfigDict(extra="forbid")


def create_autopilot_app(factory=None, access=None):
    access = access or Access.from_env()
    service={'engine':None,'error':None,'working':False,'heartbeat':None}
    @asynccontextmanager
    async def lifespan(app):
        STORE.mkdir(parents=True,exist_ok=True)
        handle=(STORE/'engine.lock').open('a')
        try:
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            handle.close()
            raise RuntimeError('另一個自動交易服務正在使用此帳本，拒絕重複啟動')
        try:
            try:
                service['engine']=factory() if factory else DemoAutopilot(configured_client())
            except Exception as exc:
                service['error']=str(exc) if isinstance(exc,ValueError) else '無法載入模擬帳戶設定，請检查本機紀錄'
            running=True
            async def loop():
                while running:
                    engine=service['engine']
                    if engine:
                        service['working']=True
                        try:await asyncio.to_thread(engine.tick)
                        except Exception:
                            logging.getLogger(__name__).exception('Autopilot tick failed; retrying next cycle')
                        finally:service['working']=False
                    service['heartbeat']=time.monotonic()
                    await asyncio.sleep(10)
            task=asyncio.create_task(loop())
            yield
        finally:
            running=False
            # Let in-flight API work finish before closing its client / releasing singleton lock.
            if 'task' in locals():
                if not service['working']:task.cancel()
                try:await task
                except asyncio.CancelledError:pass
            if service['engine']:service['engine'].client.close()
            fcntl.flock(handle,fcntl.LOCK_UN)
            handle.close()

    app=FastAPI(title='Quant Pilot · OKX Demo',lifespan=lifespan)
    app.state.service=service
    install_research(app)
    from webui.autopilot_replay_api import install_auto_replay
    install_auto_replay(app)
    app.mount('/assets',StaticFiles(directory=Path(__file__).parent/'static'),name='assets')

    app.middleware('http')(access.guard)

    @app.get('/healthz', include_in_schema=False)
    async def health():
        alive = service['heartbeat'] is not None and time.monotonic()-service['heartbeat'] < 300
        healthy = alive and service['engine'] is not None
        return JSONResponse({'status':'ok' if healthy else 'unavailable'}, status_code=200 if healthy else 503)

    @app.get('/',response_class=HTMLResponse)
    async def index():
        return (Path(__file__).parent/'static'/'autopilot.html').read_text(encoding='utf-8')

    @app.get('/api/auto/state')
    async def state():
        if not service['engine']:
            return dict(status='error',message=service['error'] or '連線準備中',mode='demo',enabled=False,
                        catalog=catalog(),config=AutoConfig().model_dump())
        return await asyncio.to_thread(service['engine'].snapshot)

    def engine():
        if not service['engine']:raise HTTPException(503,service['error'] or '機器人尚未連接')
        return service['engine']

    @app.put('/api/auto/config')
    async def configure(body:AutoConfig):
        try:return await asyncio.to_thread(engine().configure,body)
        except ValueError as exc:raise HTTPException(409,str(exc))

    @app.post('/api/auto/{action}')
    async def action(action:str,body:EmptyBody):
        if action not in ('start','pause','stop','refresh'):raise HTTPException(404,'未知操作')
        try:
            bot=engine()
            if action=='refresh':
                await asyncio.to_thread(bot.tick)
                return await asyncio.to_thread(bot.snapshot)
            return await asyncio.to_thread(getattr(bot,action))
        except (ValueError,RuntimeError) as exc:raise HTTPException(409,str(exc))
        except Exception:raise HTTPException(503,'交易所暫時無法確認操作，請重新整理狀態；不要重複送出')

    return app

app=create_autopilot_app()
if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='0.0.0.0' if Access.from_env().origin else '127.0.0.1',port=int(os.environ.get('PORT','8812')))
