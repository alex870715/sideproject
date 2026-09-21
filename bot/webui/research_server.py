"""Run: .venv/bin/python -m webui.research_server (no account or trading engine)."""
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from webui.research_api import install_research
app = FastAPI(title='Quant Studio · Research')
install_research(app)

@app.get('/')
def index():
    return RedirectResponse('/lab')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8811)
