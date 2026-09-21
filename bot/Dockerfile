FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY core ./core
COPY strategies ./strategies
COPY webui ./webui
COPY config.py ./
# Only the platform's TLS proxy may reach this port. One process owns the ledger.
CMD ["sh", "-c", "exec uvicorn webui.autopilot_server:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers --forwarded-allow-ips='*' --timeout-graceful-shutdown 120"]
