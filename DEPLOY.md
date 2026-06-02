# 雲端部署指南（不需本機 Docker）

兩種方式：**推薦用 Render 一次佈滿四個 app**；或 **GitHub Pages 只放首頁**（其餘分開佈）。

---

## 方案 A：Render + GitHub（推薦 · 一個網址全可操作）

把整個 `sideproject` 推到 GitHub，Render 會依 `render.yaml` 自動建置：

| 路徑 | 內容 |
|------|------|
| `/` | Portfolio 首頁 |
| `/chow-it/` | Chow-It Web |
| `/earth-online/` | Earth Online Web |
| `/plant/` | PlanT（含 PostgreSQL） |
| `/stockoracle/` | StockOracle |

### 步驟

**1. 建立 GitHub repo 並推送**

```bash
cd /Users/alexchen870715/sideproject
git init
git add .
git commit -m "Add portfolio hub and cloud deploy config"
git branch -M main
gh repo create sideproject --public --source=. --push
# 若沒有 gh CLI：在 GitHub 網站新建 repo，再 git remote add origin … && git push -u origin main
```

> 若 `Chow-it`、`PlanT` 等子資料夾裡已有 `.git`，先刪除子目錄的 `.git` 或改用 submodule，否則不會被一併 push。

**2. 連接 Render**

1. 打開 [render.com](https://render.com) 並用 GitHub 登入  
2. **New → Blueprint**  
3. 選剛 push 的 `sideproject` repo  
4. Render 會讀取根目錄的 `render.yaml`，建立：  
   - `plant-db`（PostgreSQL）  
   - `plant`、`stockoracle`（內網）  
   - `gateway`（對外網址）  
5. 在 **gateway** 服務的 Environment 可選填：  
   - `EXPO_PUBLIC_MAPBOX_TOKEN`（Earth Online 地圖）  
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`（雲端同步）  
6. 按 **Apply** 開始建置（**首次約 15–30 分鐘**）

**3. 取得網址**

建置完成後，Render 會給 `gateway` 一個網址，例如：

`https://sideproject-gateway.onrender.com`

四個 app 的連結都從這個網域的相對路徑進入（`portfolio/config.js` 已設好）。

### 免費方案限制

- 閒置約 **15 分鐘會休眠**，再開要等 ~1 分鐘喚醒  
- 建置時間長、CPU 有限；StockOracle 掃全市場仍可能較慢  

---

## 方案 B：GitHub Pages（只有 Portfolio 首頁）

適合：先上線「作品介紹頁」，各 app 分別用 Vercel / Streamlit Cloud 等。

**1.** 同上，把 repo push 到 GitHub  

**2.** GitHub repo → **Settings → Pages**  

- Source 選 **GitHub Actions**  

**3.** push 到 `main` 後，workflow `.github/workflows/deploy-portfolio-pages.yml` 會自動部署  

**4.** 網址會是：`https://<username>.github.io/<repo>/`  

**5.** 修改 `portfolio/config.js` 裡各專案的 `href`，改成實際雲端網址，例如：

```javascript
href: "https://你的-plant.vercel.app/",
href: "https://你的-app.streamlit.app/",
```

GitHub Pages **無法** 直接跑 Next.js / Streamlit，所以「全部可操作」仍要搭配方案 A 或其他平台。

---

## 方案 C：各 app 分開佈（進階）

| 專案 | 平台 | 備註 |
|------|------|------|
| Portfolio | GitHub Pages | 本 repo workflow |
| PlanT | [Vercel](https://vercel.com) | Root 指 `PlanT/`，需 Neon/Supabase Postgres |
| StockOracle | [Streamlit Cloud](https://share.streamlit.io) | 已有 `github.com/alex870715/StockOracle` |
| Chow-It | Vercel | Build: `npx expo export -p web`，Output: `dist` |
| Earth Online | Vercel | 同上 + Mapbox env |

Portfolio 的 `config.js` 改成各服務的完整 URL。

---

## 常見問題

**子資料夾有自己的 git，push 上去是空的？**  
在子目錄執行 `rm -rf .git`（先確認已備份），再從根目錄 commit。

**Render 建置失敗？**  
到 Render Dashboard → 該服務 → Logs；常見是 Expo export 逾時，可改 `plan: starter`（付費）或先只部署 `gateway` + `stockoracle` 測試。

**不想用 Render？**  
Railway、Fly.io 也支援從 GitHub 連 repo 並用根目錄的 `docker-compose.yml` 建置，流程類似：連 GitHub → 選 compose → 對外開 `gateway` 的 port。

---

## 本機 Docker（可選）

若之後想在電腦試跑：`./deploy.sh`（需 Docker Desktop）。
