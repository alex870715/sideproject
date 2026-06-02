#!/usr/bin/env bash
# 一鍵啟動 Portfolio + 四個 side project（Docker Compose）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 請先安裝 Docker Desktop：https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker 未啟動，請先打開 Docker Desktop 再執行一次。"
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "ℹ️  已建立 .env（Earth Online 地圖可選填 EXPO_PUBLIC_MAPBOX_TOKEN）"
fi

echo "🔨 建置並啟動所有服務（首次約 10–20 分鐘）…"
docker compose up --build -d

echo ""
echo "✅ 已上線（本機）"
echo "   首頁 Portfolio   → http://localhost:8080/"
echo "   Chow-It          → http://localhost:8080/chow-it/"
echo "   Earth Online     → http://localhost:8080/earth-online/"
echo "   PlanT            → http://localhost:8080/plant/"
echo "   StockOracle      → http://localhost:8080/stockoracle/"
echo ""
echo "停止：docker compose down"
echo "查看 log：docker compose logs -f"
