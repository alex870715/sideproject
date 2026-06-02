# Portfolio 一鍵部署

用 **Docker Compose** 在同一個網址下跑五個服務：首頁 + 四個可操作的 app。

## 一鍵啟動

```bash
cd /path/to/sideproject
chmod +x deploy.sh
./deploy.sh
```

首次建置約 **10–20 分鐘**（要編譯 Next.js、兩個 Expo Web、Streamlit）。

| 頁面 | 網址 |
|------|------|
| Portfolio 首頁 | http://localhost:8080/ |
| Chow-It | http://localhost:8080/chow-it/ |
| Earth Online | http://localhost:8080/earth-online/ |
| PlanT | http://localhost:8080/plant/ |
| StockOracle | http://localhost:8080/stockoracle/ |

## 停止

```bash
docker compose down
```

## Earth Online 地圖（可選）

複製 `.env.example` → `.env`，填入：

```env
EXPO_PUBLIC_MAPBOX_TOKEN=pk.你的_mapbox_token
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的_anon_key
```

改完後重新建置 gateway：

```bash
docker compose up --build -d gateway
```

## 架構

```text
:8080 gateway (nginx)
  ├── /              → portfolio 靜態
  ├── /chow-it/      → Expo Web 靜態
  ├── /earth-online/ → Expo Web 靜態
  ├── /plant/        → Next.js + PostgreSQL
  └── /stockoracle/  → Streamlit
```

## 雲端上線

把整個 `sideproject` 推到有 Docker 的 VPS（Railway、Fly.io、DigitalOcean 等），執行 `./deploy.sh`，並把 8080 對外或加 HTTPS reverse proxy。

Streamlit 子路徑已設 `baseUrlPath`；PlanT 使用 `NEXT_PUBLIC_BASE_PATH=/plant`。
