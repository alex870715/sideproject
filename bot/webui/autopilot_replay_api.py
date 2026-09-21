import asyncio
import json
import logging
import uuid
from fastapi import HTTPException
from core.autopilot_backtest import ReplayConfig,run_backtest
from core.demo_autopilot import STORE


def install_auto_replay(app):
    jobs={};tasks=set()
    def save(result):
        path=STORE/'backtests';path.mkdir(parents=True,exist_ok=True)
        key=uuid.uuid4().hex
        tmp=path/(key+'.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False))
        tmp.replace(path/(key+'.json'))
        return key

    @app.post('/api/auto-replay/jobs',status_code=202)
    async def start(config:ReplayConfig):
        if tasks:raise HTTPException(409,'已有回測執行中，請等待結果')
        while len(jobs)>=10:jobs.pop(next(iter(jobs)))
        key=uuid.uuid4().hex
        jobs[key]=dict(id=key,status='running',message='準備 OKX 永續合約歷史資料')
        loop=asyncio.get_running_loop()
        def progress(message):loop.call_soon_threadsafe(jobs[key].update,{'message':message})
        async def work():
            try:
                result=await asyncio.to_thread(run_backtest,config,progress)
                saved=await asyncio.to_thread(save,result)
                jobs[key].update(status='completed',result=result,result_id=saved)
            except Exception as exc:
                logging.getLogger(__name__).exception('Autopilot replay failed')
                jobs[key].update(status='failed',message=str(exc) if isinstance(exc,ValueError) else '取得 OKX 歷史資料失敗，請稍後重試')
        task=asyncio.create_task(work());tasks.add(task);task.add_done_callback(tasks.discard)
        return jobs[key]

    @app.get('/api/auto-replay/jobs/{key}')
    async def get(key:str):
        if key not in jobs:raise HTTPException(404,'工作不存在；已完成結果可在歷史紀錄查看')
        return jobs[key]

    @app.get('/api/auto-replay/history')
    async def history():
        def read():
            out=[]
            for p in sorted((STORE/'backtests').glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:30]:
                try:out.append({'id':p.stem,'data':json.loads(p.read_text())})
                except (OSError,ValueError):continue
            return out
        return await asyncio.to_thread(read)
