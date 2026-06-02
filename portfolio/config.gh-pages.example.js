/**
 * GitHub Pages 專用：若 repo 名為 sideproject，首頁在 /sideproject/
 * 全站 Render 部署請用 config.js（相對路徑 /chow-it/ 等）
 */
(function () {
  var repo = "sideproject"; // 改成你的 GitHub repo 名稱
  var pagesBase = "/" + repo + "/";

  window.PORTFOLIO = {
    owner: {
      name: "Alex Chen",
      tagline: "Side projects · 工具、遊戲與實驗",
      bio: "Portfolio 首頁在 GitHub Pages；各 app 請在 DEPLOY.md 方案 A（Render）佈署後，把下方 href 改成 Render 網址。",
      github: "https://github.com/alex870715",
    },
    projects: [
      {
        id: "chow-it",
        name: "Chow-It",
        subtitle: "喬一餐",
        tag: "聚餐 · 決策",
        accent: "#f97316",
        description: "好友聚餐決策：口味測驗、用餐日記、轉盤／抽抽樂、談判室。",
        stack: ["Expo", "React Native", "Tamagui"],
        href: "https://YOUR-GATEWAY.onrender.com/chow-it/",
        hrefLabel: "進入 Chow-It",
        enabled: true,
        note: "請把 YOUR-GATEWAY 改成 Render gateway 網址",
      },
      {
        id: "earth-online",
        name: "Earth Online",
        subtitle: "地球 Online",
        tag: "探索 · 遊戲",
        accent: "#38bdf8",
        description: "現實世界探索遊戲：迷霧解鎖、成就、Google 定位匯入。",
        stack: ["Expo", "React Native", "Mapbox"],
        href: "https://YOUR-GATEWAY.onrender.com/earth-online/",
        hrefLabel: "進入 Earth Online",
        enabled: true,
        note: "需 Mapbox token（Render env）",
      },
      {
        id: "plant",
        name: "PlanT",
        subtitle: "🌱",
        tag: "旅行 · 協作",
        accent: "#10b981",
        description: "團體旅行規劃：Trunk & Sprouts、seed 分享、AI 小冊。",
        stack: ["Next.js 15", "Prisma", "PostgreSQL"],
        href: "https://YOUR-GATEWAY.onrender.com/plant/",
        hrefLabel: "進入 PlanT",
        enabled: true,
        note: "",
      },
      {
        id: "stock-oracle",
        name: "StockOracle",
        subtitle: "選股與資產規劃",
        tag: "量化 · 研究",
        accent: "#a78bfa",
        description: "多策略選股、回測、持股健檢。台股／美股。",
        stack: ["Python", "Streamlit", "yfinance"],
        href: "https://YOUR-GATEWAY.onrender.com/stockoracle/",
        hrefLabel: "進入 StockOracle",
        enabled: true,
        note: "或改用 share.streamlit.io 獨立網址",
      },
    ],
  };
})();
