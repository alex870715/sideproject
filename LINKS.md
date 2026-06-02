# 讓 GitHub Pages 連結不要 404（混合部署）

GitHub Pages **只能放 Portfolio 首頁**。各 app 要各自部署，再在 `portfolio/config.js` 填網址。

---

## 能不能四個都用 Streamlit？

| 專案 | 能用 Streamlit Cloud？ | 原因 |
|------|------------------------|------|
| **StockOracle** | ✅ 可以 | Python + Streamlit |
| **Chow-It** | ❌ 不行 | Expo / React Native Web |
| **Earth Online** | ❌ 不行 | Expo / React Native |
| **PlanT** | ❌ 不行 | Next.js + PostgreSQL API |

Streamlit Cloud **只跑** `streamlit run xxx.py`，不能 host Next.js 或 Expo app。

---

## 推薦做法（你現在的情境）

| 專案 | 部署平台 | 你會得到 |
|------|----------|----------|
| **Portfolio 首頁** | GitHub Pages | `https://alex870715.github.io/sideproject/` |
| **StockOracle** | [Streamlit Cloud](https://share.streamlit.io)（你已在用） | `https://xxx.streamlit.app` |
| **PlanT** | [Vercel](https://vercel.com) + [Neon](https://neon.tech) Postgres | `https://plant-xxx.vercel.app` |
| **Chow-It** | Vercel（Expo Web export） | `https://chow-it-xxx.vercel.app` |
| **Earth Online** | Vercel Web demo，或 App Store 連結 | 擇一 |

首頁在 **github.io**，卡片連到各平台 **完整 URL** — 完全可行，也是很多人 portfolio 的做法。

---

## 設定連結（編輯 config.js）

打開 `portfolio/config.js`，在 `PROJECT_URLS` 填入你的網址：

```javascript
var PROJECT_URLS = {
  "chow-it": "https://你的-chow-it.vercel.app",
  "earth-online": "https://你的-earth.vercel.app",
  "plant": "https://你的-plant.vercel.app",
  "stock-oracle": "https://你的-stockoracle.streamlit.app",
};
```

commit + push 到 `main`，GitHub Pages 會自動更新。

### 或用 GitHub Secrets（CI 自動替換）

Repo → Settings → Secrets → Actions，新增：

| Secret | 範例 |
|--------|------|
| `URL_STOCKORACLE` | `https://stockoracle-xxx.streamlit.app` |
| `URL_CHOWIT` | `https://…` |
| `URL_PLANT` | `https://…` |
| `URL_EARTHONLINE` | `https://…` |

push 後 workflow 會替換 `__URL_xxx__`  placeholder。

---

## StockOracle（Streamlit Cloud）

你原本獨立 repo `alex870715/StockOracle` 可以**繼續用**：

1. [share.streamlit.io](https://share.streamlit.io) → 連該 repo  
2. Main file：`app.py`  
3. 複製 `.streamlit.app` 網址 → 填進 `URL_STOCKORACLE`

monorepo 裡的 `StockOracle/` 是同一套程式；若要改 deploy Streamlit 指到 monorepo 子目錄，需在 Streamlit Cloud 設 **Root directory** 為 `StockOracle`（若平台支援）。

---

## PlanT（Vercel 簡述）

1. [vercel.com](https://vercel.com) → Import `sideproject` repo  
2. **Root Directory** 設 `PlanT`  
3. 環境變數 `DATABASE_URL` → Neon 免費 Postgres 連線字串  
4. Deploy 後把 Vercel 網址填進 `URL_PLANT`

---

## Chow-It / Earth Online（Vercel 簡述）

Expo Web 需先 static export（本地或 CI）：

```bash
cd Chow-it && npx expo export -p web
# 輸出在 dist/
```

Vercel：Root 指到 `Chow-it`，Output 目錄 `dist`（或加 build command `npx expo export -p web`）。

Earth Online 同理，Root 指 `EarthOnline/mobile`，並在 Vercel 設 `EXPO_PUBLIC_MAPBOX_TOKEN` 等 env。

---

## 還想用「一個網址包全部」？

那就是 **Render Blueprint**（`render.yaml`），不是 Streamlit。見 `DEPLOY.md` 方案 A。

---

## 檢查清單

- [ ] StockOracle 已在 streamlit.app 可開  
- [ ] 其餘三個已部署到 Vercel（或其他）  
- [ ] `portfolio/config.js` 四個 URL 都填好  
- [ ] push → 開 github.io 點卡片確認不 404  
