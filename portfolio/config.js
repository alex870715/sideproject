/**
 * Portfolio 設定 — GitHub Pages 首頁 + 各 app 獨立網址
 *
 * 每個專案填 url（完整 https://…）即可；留 __URL_xxx__ 表示尚未設定。
 * 也可用 GitHub Actions Secrets 自動替換（見 LINKS.md）。
 *
 * 注意：只有 StockOracle 能放 Streamlit Cloud；其餘三個需 Vercel 等平台。
 */
(function () {
  /** 可選：若四個 app 都佈在同一個 Render gateway，填一個網址即可當 fallback */
  var APPS_ORIGIN = "__APPS_ORIGIN__";

  var PROJECT_URLS = {
    "chow-it": "__URL_CHOWIT__",
    "earth-online": "__URL_EARTHONLINE__",
    "plant": "__URL_PLANT__",
    "stock-oracle": "__URL_STOCKORACLE__",
  };

  function isPlaceholder(v) {
    return !v || v.indexOf("__URL_") === 0 || v === "__APPS_ORIGIN__";
  }

  function resolveAppsBase() {
    var host = location.hostname;
    if (
      /\.onrender\.com$/i.test(host) ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return "";
    }
    if (!isPlaceholder(APPS_ORIGIN)) {
      return APPS_ORIGIN.replace(/\/$/, "");
    }
    return null;
  }

  function resolveHref(id, path) {
    var direct = PROJECT_URLS[id];
    if (!isPlaceholder(direct)) return direct;

    var base = resolveAppsBase();
    if (base !== null) return base + path;

    return null;
  }

  window.PORTFOLIO = {
    owner: {
      name: "Alex Chen",
      tagline: "Side projects · 工具、遊戲與實驗",
      bio: "這裡是我正在做的 side projects：從聚餐決策、世界探索遊戲、團體旅行規劃，到量化選股與持股健檢。點卡片進入各專案。",
      github: "https://github.com/alex870715",
    },
    projects: [
      {
        id: "chow-it",
        name: "Chow-It",
        subtitle: "喬一餐",
        tag: "聚餐 · 決策",
        accent: "#f97316",
        path: "/chow-it/",
        description:
          "好友聚餐時的決策助手：30 秒口味測驗建立 Taste Profile、用餐日記月曆、轉盤／抽抽樂／跳跳樂幫你決定吃什麼，還有「談判室」讓代理人代大家協調點餐。",
        stack: ["Expo", "React Native", "Tamagui"],
        hrefLabel: "進入 Chow-It",
        note: "Web 版 · 建議 Vercel 部署 Expo export",
      },
      {
        id: "earth-online",
        name: "Earth Online",
        subtitle: "地球 Online",
        tag: "探索 · 遊戲",
        accent: "#38bdf8",
        path: "/earth-online/",
        description:
          "把現實世界走過的路變成地圖上的探索：迷霧解鎖、區域活動、成就與等級，支援匯入 Google 定位紀錄，在地球儀上慢慢「開圖」。",
        stack: ["Expo", "React Native", "Mapbox"],
        hrefLabel: "進入 Earth Online",
        note: "Web demo · Vercel；完整版可連 App Store",
      },
      {
        id: "plant",
        name: "PlanT",
        subtitle: "🌱",
        tag: "旅行 · 協作",
        accent: "#10b981",
        path: "/plant/",
        description:
          "智慧團體旅行規劃：主幹與分支路線（Trunk & Sprouts）、6 碼 seed 分享行程、地圖協作，還能用 AI 生成童話風格旅行小冊。",
        stack: ["Next.js 15", "Prisma", "PostgreSQL", "OpenAI"],
        hrefLabel: "進入 PlanT",
        note: "Next.js · 建議 Vercel + Neon Postgres",
      },
      {
        id: "stock-oracle",
        name: "StockOracle",
        subtitle: "選股與資產規劃",
        tag: "量化 · 研究",
        accent: "#a78bfa",
        path: "/stockoracle/",
        description:
          "多策略選股、walk-forward 回測、資產配置與持股健檢（含融資口徑淨資產／成本）。支援台股／美股、繁中／英文，研究示範用途。",
        stack: ["Python", "Streamlit", "yfinance"],
        hrefLabel: "進入 StockOracle",
        note: "Streamlit Cloud · *.streamlit.app",
      },
    ],
  };

  var anyEnabled = false;
  window.PORTFOLIO.projects.forEach(function (p) {
    p.href = resolveHref(p.id, p.path);
    p.enabled = !!p.href;
    if (p.enabled) anyEnabled = true;
  });

  window.PORTFOLIO.setupRequired = !anyEnabled;
})();
