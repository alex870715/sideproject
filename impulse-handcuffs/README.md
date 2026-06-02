# 綁手手神器

**購物頁標價旁一鍵看懂：十年試算＋嘴砲模式** —— 提醒自己手別滑太勤的小工具。  
英文代號：**Impulse Handcuffs**。

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat&logo=googlechrome&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite&logoColor=white)

---

## 會做什麼？

在支援的電商網站上，偵測商品**價格文字**，在旁邊掛一顆 **「綁手手」chip**（盾牌圖示）。  
滑過可展開面板：用你選的**假裝投資標的／CAGR**粗算 **10 年後名目累積**，並附一段**可切換語言的吐槽文案**（繁中／英／日／韓）。

> 誇飾玩笑性質，**不是投資建議**；過去報酬不代表未來。

### 目前支援的賣場（範例）

Amazon（多區）、Shopee（多區）、pchome、樂天、momo 購物等 —— 實際以 `manifest.config.ts` 的 `host_permissions`／`content_scripts.matches` 為準。

---

## 截圖

建議在 README 放 2～4 張圖（Chrome 商店審核與下載轉換也很有幫助）：

| 情境 | 說明 |
|------|------|
| 商品頁＋ chip | 價格旁出現紫色／漸層按鈕 |
| 展開面板 | 試算列＋吐槽區 |
| 擴充 popup | 語言、標的、獨立視窗設定 |

將圖片存成 `docs/screenshots/` 後，可在這裡用相對路徑引用，例如：`![商品頁](./docs/screenshots/product.png)`。

---

## 技術棧

| 項目 | 說明 |
|------|------|
| **Chrome MV3** | `manifest_version: 3` |
| **UI** | React 18、Tailwind（`wvp-` 前綴隔離樣式） |
| **建置** | Vite 6、`@crxjs/vite-plugin` |
| **圖示** | Lucide Shield 路徑 → `sharp` 輸出 PNG |

---

## 本機開發

### 需求

- Node.js 18+（建議 LTS）
- npm

### 安裝與建置

本專案在本機的資料夾名稱建議為 **`impulse-handcuffs`**（與英文品牌 **Impulse Handcuffs** 一致）。

```bash
git clone https://github.com/alex870715/Impulse-Handcuffs.git
cd impulse-handcuffs   # 若你 clone 到別名，請改成實際資料夾名稱
npm install
npm run build
```

- `npm run dev`：開發模式（一般用於 UI；擴充完整行為仍以載入 `dist` 為準）。
- `npm run icons`：只從 `icons/source-shield.svg` 重新產生 `icon16/48/128.png`。
- `npm run build`：**先跑 icons** → TypeScript 檢查 → 輸出到 **`dist/`**。

### 以「未封裝」方式載入 Chrome

1. 開啟 `chrome://extensions/`
2. 開啟**開發人員模式**
3. **載入未封裝項目**，選專案內的 **`dist`** 資料夾（不是專案根目錄）
4. 改程式後請再執行 `npm run build`，然後在 `chrome://extensions/` 點**重新整理**該擴充

---

## 權限與隱私（簡要）

| 權限 | 用途 |
|------|------|
| `storage` | 儲存介面語言、選取的試算用標的等設定（本機） |
| `windows` | 「獨立視窗」開啟設定頁時建立 popup 視窗 |
| **主機權限**（各賣場網址） | 內容腳本在商品頁掃描價格文字並插入 UI |

價格與試算在**使用者瀏覽器端**處理；請參考 `manifest.config.ts` 與 `src/content` 了解實際行為。若你要上架 Chrome 線上應用程式商店，建議另備一份**隱私權說明頁**（可放在 GitHub Pages 或 Notion 公開頁），說明「不蒐集個資／無後端」等。

---

## 專案結構（精簡）

```text
manifest.config.ts      # MV3 設定（@crxjs/vite-plugin）
src/
  App.tsx               # 擴充 popup／獨立視窗設定 UI
  content/              # 內容腳本：掃描價格、掛上 chip
  lib/                  # 價格解析、i18n、storage、試算…
icons/
  source-shield.svg     # 向量源檔
scripts/
  build-extension-icons.mjs
dist/                   # 建置產物（勿手動編輯；已 .gitignore）
```

---

## 授權

若未另附 `LICENSE` 檔，預設為「版權所有」。若要開源，可自行加入 MIT／ISC 等授權條款並於此處更新說明。

---

## 致謝

- [Lucide](https://lucide.dev/)（Shield 圖示路徑，ISC License）

---

以下為 **上架 Chrome 線上應用程式商店** 與 **優化建議**（可自用或貼到 Wiki）。

<details>
<summary><strong>上架 Chrome Web Store（步驟總覽）</strong></summary>

1. **一次性註冊開發人員帳號**  
   前往 [Chrome Web Store Developer Program](https://developer.chrome.com/docs/webstore/register) 依流程登入 Google 帳號並支付一次性註冊費（目前為美金計價，請以官方頁面為準）。

2. **打包要上傳的內容**  
   - 在本機執行 `npm run build`。  
   - 將 **`dist` 資料夾**打包成 **ZIP**（壓縮檔**根目錄**應直接含 `manifest.json`，不要多一層「dist」資料夾名再包一層，依實際結構檢查）。  
   - 不要上傳 `node_modules`、原始碼中未使用的檔案。

3. **Developer Dashboard → 新增項目**  
   上傳 ZIP，填寫商店清單：**名稱、說明、圖示、截圖、分類、隱私權／資料使用說明** 等。

4. **商店素材建議**  
   - **小型專用圖示**：16／48／128（專案已內建）。  
   - **螢幕截圖**：至少 1 張；常見為 **1280×800** 或 **640×400**（請以 [官方目前規範](https://developer.chrome.com/docs/webstore/images) 為準）。  
   - **選用**：宣傳用圖片、YouTube 介紹影片（可提升轉換率）。

5. **審核**  
   - 說明欄寫清楚**功能、權限用途、是否蒐集資料**。  
   - 若被退件，依回信修改 manifest／文字／權限敘述後再送。

6. **版本更新**  
   修改 `manifest.config.ts` 的 `version`（語意化版本，如 `0.1.1`），重新 `npm run build`、打 ZIP，在後台上傳新版本。

</details>

<details>
<summary><strong>優化建議（產品、技術、商店）</strong></summary>

**產品與信任**

- **前兩句話講完價值**：商店描述開頭寫「誰／在什麼情境／得到什麼」，避免只有工程敘述。  
- **隱私權與資料**：維持「透明、簡短、可連結」；無後端就明說「資料僅存本機」。  
- **截圖＋短影片**：同一個功能用圖文講一次，轉換率通常優於純文字。

**技術**

- **權限**：維持最小必要；若未來可改為 `optional_host_permissions` + 引導使用者啟用，可減少第一眼看到的「要你全部賣場」心理門檻（需評估實作成本與 UX）。  
- **效能**：大量 DOM 變更時維持 debounce／避免重複掛 chip（現有邏輯可定期檢視）。  
- **相容**：重大改版後在 Amazon／Shopee／momo 各抽一頁 smoke test。  
- **版本與 Changelog**：GitHub **Releases** 或 `CHANGELOG.md` 方便使用者與審核追蹤。

**商店 SEO／呈現**

- **短描述**字數有限，把核心關鍵字放前面（例：價格、試算、剁手、理財教育向的幽默）。  
- **評論**：上架後適度回覆使用者，有助長期評分。  
- **品牌化**：README／商店／popup 用名一致（綁手手神器／Impulse Handcuffs）較好記。

</details>
