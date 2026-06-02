/**
 * Portfolio 設定
 *
 * GitHub Pages 只放首頁；四個 app 跑在 Render（同一個 gateway 網址底下）。
 * 佈署 Render 後，把 APPS_ORIGIN 改成你的 gateway 網址，或在 GitHub repo
 * Settings → Secrets → APPS_ORIGIN 設定（Actions 會自動替換 __APPS_ORIGIN__）。
 */
(function () {
  /** @type {string} Render gateway 網址，不要結尾斜線。未佈署前保持 __APPS_ORIGIN__ */
  var APPS_ORIGIN = "__APPS_ORIGIN__";

  function resolveAppsBase() {
    var host = location.hostname;
    // 在 Render / 本機 Docker 上，首頁與 app 同域 → 用相對路徑
    if (
      /\.onrender\.com$/i.test(host) ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return "";
    }
    // GitHub Pages 等外部入口 → 連到 Render
    if (APPS_ORIGIN && APPS_ORIGIN !== "__APPS_ORIGIN__") {
      return APPS_ORIGIN.replace(/\/$/, "");
    }
    return null;
  }

  function appHref(path) {
    var base = resolveAppsBase();
    if (base === null) return null;
    return base + path;
  }

  window.PORTFOLIO = {
    appsBase: resolveAppsBase(),
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
        note: "Web 版；相機／相片功能依瀏覽器權限",
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
        note: "地圖需 Mapbox token（Render gateway 環境變數）",
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
        note: "含 PostgreSQL；首次建立行程需數秒",
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
        note: "研究示範；全市場掃描首次較慢",
      },
    ],
  };

  window.PORTFOLIO.projects.forEach(function (p) {
    p.href = appHref(p.path);
    p.enabled = !!p.href;
  });

  window.PORTFOLIO.setupRequired = window.PORTFOLIO.appsBase === null;
})();
