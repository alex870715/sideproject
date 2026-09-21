"""Research routes shared by the trading dashboard and credential-free server."""
import asyncio
import json
import logging
import uuid
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from core.research import ResearchConfig, catalog, run_research
from core.storage import DATA_DIR

STORE = DATA_DIR / 'research'


def install_research(app):
    jobs = {}
    running = set()

    def save(kind, value):
        directory = STORE / kind
        directory.mkdir(parents=True, exist_ok=True)
        key = uuid.uuid4().hex
        temporary = directory / (key + '.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        temporary.replace(directory / (key + '.json'))
        return key

    @app.get('/lab', response_class=HTMLResponse)
    async def lab():
        return (Path(__file__).parent / 'static' / 'lab.html').read_text(encoding='utf-8')

    @app.get('/api/research/catalog')
    async def get_catalog():
        return catalog()

    @app.post('/api/research/drafts', status_code=201)
    async def draft(body: ResearchConfig):
        key = await asyncio.to_thread(save, 'drafts', body.model_dump())
        return {'id': key, 'config': body.model_dump()}

    @app.get('/api/research/saved/{kind}')
    async def saved(kind: str):
        if kind not in ('drafts', 'results'):
            raise HTTPException(404, '找不到此類別')
        def read():
            items = []
            for p in sorted((STORE / kind).glob('*.json'), key=lambda p:p.stat().st_mtime, reverse=True)[:50]:
                try:
                    items.append({'id':p.stem, 'data':json.loads(p.read_text(encoding='utf-8'))})
                except (OSError, ValueError):
                    continue
            return items
        return await asyncio.to_thread(read)

    @app.post('/api/research/backtests', status_code=202)
    async def start(body: ResearchConfig):
        if running:
            raise HTTPException(409, '已有回測執行中，請等待完成')
        key = uuid.uuid4().hex
        while len(jobs) >= 20:
            jobs.pop(next(iter(jobs)))
        jobs[key] = {'id':key, 'status':'running', 'message':'準備下載 OKX 歷史資料'}
        loop = asyncio.get_running_loop()
        def progress(message):
            loop.call_soon_threadsafe(jobs[key].update, {'message':message})
        async def work():
            try:
                result = await asyncio.to_thread(run_research, body, progress)
                result_id = await asyncio.to_thread(save, 'results', result)
                jobs[key].update(status='completed', result=result, result_id=result_id)
            except Exception as exc:
                logging.getLogger(__name__).exception('Research backtest failed')
                message = str(exc) if isinstance(exc, ValueError) else 'OKX 資料連線或回測失敗，請稍後重試。'
                jobs[key].update(status='failed', message=message)
        task = asyncio.create_task(work())
        running.add(task)
        task.add_done_callback(running.discard)
        return jobs[key]

    @app.get('/api/research/backtests/{key}')
    async def job(key: str):
        if key not in jobs:
            raise HTTPException(404, '回測工作不存在，請查看已儲存結果或重新執行')
        return jobs[key]
