# 讓 Portfolio 連結不要 404

GitHub Pages **只能放靜態首頁**，跑不了 PlanT / Streamlit / Expo 後端。  
要讓四個 app **真的能點進去操作**，需要再佈署 **Render 全站**，並把網址填回設定。

---

## 你要做的事（約 10 分鐘 + 等建置）

### 步驟 1：在 Render 佈署四個 app

1. 打開 **[render.com](https://render.com)**，用 GitHub 登入  
2. 點 **New → Blueprint**  
3. 選 repo：**`alex870715/sideproject`**  
4. Render 會讀取根目錄的 `render.yaml`，建立：
   - `plant-db`（PostgreSQL）
   - `plant`、`stockoracle`（內網）
   - **`gateway`**（對外網址，含 Portfolio + 四個 app）
5. 按 **Apply**，等建置完成（**首次約 15–30 分鐘**）

建置成功後，在 Render Dashboard 點 **`gateway`** 服務，複製 **URL**，例如：

```text
https://gateway-xxxx.onrender.com
```

（實際網址以 Render 顯示為準，不要自己猜。）

在瀏覽器直接打開這個網址，應該能看到 Portfolio，且：

- `https://你的網址/chow-it/`
- `https://你的網址/plant/`
- `https://你的網址/stockoracle/`

都能進去（Earth Online 地圖需 Mapbox token，見下方）。

> **建議：** 之後書籤用 **Render 的 gateway 網址** 當主入口，比 GitHub Pages 少一層跳轉。

---

### 步驟 2：讓 GitHub Pages 上的連結也指向 Render

GitHub Pages（`alex870715.github.io/sideproject/`）上的卡片，需要知道 Render 網址才不會 404。

**做法 A — GitHub Secret（推薦）**

1. 打開 https://github.com/alex870715/sideproject/settings/secrets/actions  
2. **New repository secret**  
   - Name：`APPS_ORIGIN`  
   - Value：你的 gateway 網址，例如 `https://gateway-xxxx.onrender.com`（**不要**結尾 `/`）  
3. 到 **Actions** → **Deploy portfolio to GitHub Pages** → **Run workflow** 重新部署

**做法 B — 直接改檔案**

編輯 `portfolio/config.js`，把：

```javascript
var APPS_ORIGIN = "__APPS_ORIGIN__";
```

改成：

```javascript
var APPS_ORIGIN = "https://gateway-xxxx.onrender.com";
```

commit + push 到 `main`。

---

### 步驟 3（可選）：Earth Online 地圖

Render → **gateway** 服務 → **Environment**：

| 變數 | 說明 |
|------|------|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | [Mapbox](https://account.mapbox.com/access-tokens/) token |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 專案 URL（雲端同步） |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

改完後對 **gateway** 按 **Manual Deploy → Clear build cache & deploy**（Earth Online 是建置時打包進靜態檔）。

---

## 兩個網址怎麼用？

| 入口 | 網址 | 連結行為 |
|------|------|----------|
| **Render（推薦）** | `https://gateway-xxxx.onrender.com/` | 同域，全部相對路徑，一定不 404 |
| **GitHub Pages** | `https://alex870715.github.io/sideproject/` | 需設定 `APPS_ORIGIN` 才會連到 Render |

---

## 常見問題

**Render 建置失敗？**  
到 Render → 該服務 → **Logs**。Expo 建置較久，可先看 `gateway` 的 log。

**點連結很慢？**  
Render 免費版閒置會休眠，第一次開要等 ~1 分鐘喚醒。

**還是 404？**  
確認 `APPS_ORIGIN` 與 Render Dashboard 上的 gateway URL **完全一致**（含 `https://`、不要多斜線）。
