import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "綁手手神器",
  version: "0.1.0",
  description:
    "購物頁價格旁一鍵看十年試算＋嘴砲模式，提醒自己手別滑太勤。",
  permissions: ["storage", "windows"],
  host_permissions: [
    "*://*.amazon.com/*",
    "*://*.amazon.co.jp/*",
    "*://*.amazon.co.uk/*",
    "*://shopee.tw/*",
    "*://*.shopee.sg/*",
    "*://*.shopee.co.id/*",
    "*://*.shopee.com.my/*",
    "*://*.shopee.ph/*",
    "*://*.shopee.vn/*",
    "*://*.shopee.com.br/*",
    "*://24h.pchome.com.tw/*",
    "*://*.pchome.com.tw/*",
    "*://*.rakuten.co.jp/*",
    "*://*.rakuten.com/*",
    "*://*.momoshop.com.tw/*",
  ],
  action: {
    default_title: "綁手手神器",
    default_popup: "index.html",
  },
  content_scripts: [
    {
      matches: [
        "*://*.amazon.com/*",
        "*://*.amazon.co.jp/*",
        "*://*.amazon.co.uk/*",
        "*://shopee.tw/*",
        "*://*.shopee.sg/*",
        "*://*.shopee.co.id/*",
        "*://*.shopee.com.my/*",
        "*://*.shopee.ph/*",
        "*://*.shopee.vn/*",
        "*://*.shopee.com.br/*",
        "*://24h.pchome.com.tw/*",
        "*://*.pchome.com.tw/*",
        "*://*.rakuten.co.jp/*",
        "*://*.rakuten.com/*",
        "*://*.momoshop.com.tw/*",
      ],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
    },
  ],
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
});
