import type { SpotRecommendations } from "@/lib/spot-recommendations";

type Food = { name: string; tip: string };
type Sight = { name: string; tip: string };

const FOOD_BY_KEYWORD: Record<string, Food[]> = {
  屋台: [
    { name: "博多拉麵", tip: "中洲屋台必點，建議避開尖峰 19:00 後較少排队" },
    { name: "烤雞串（やきとり）", tip: "搭配生啤酒，多數攤位只收現金" },
    { name: "明太子", tip: "可外帶當伴手禮，福岡名物" },
  ],
  拉麵: [
    { name: "一蘭拉麵", tip: "博多站旁本店，建議離峰或事先排隊" },
    { name: "一風堂", tip: "白丸元味是經典選擇" },
  ],
  天滿宮: [
    { name: "梅枝餅（梅ヶ枝餅）", tip: "參道兩側現烤現吃，熱的最好吃" },
    { name: "茶屋抹茶甜點", tip: "參拜後休息很適合" },
  ],
  糸島: [
    { name: "海鮮丼", tip: "漁港周邊午餐人氣高" },
    { name: "海邊咖啡廳甜點", tip: "櫻井神社附近網美咖啡廳多" },
  ],
  由布院: [
    { name: "湯豆腐", tip: "溫泉街午餐經典" },
    { name: "布丁／蛋糕捲", tip: "B-speak 等名店建議早到" },
  ],
  明太子: [
    { name: "明太子 DIY 成品", tip: "體驗後可直接帶回" },
    { name: "明太子御飯糰", tip: "車站周邊便利店也有" },
  ],
};

const SIGHT_BY_KEYWORD: Record<string, Sight[]> = {
  機場: [
    { name: "國內線美食街", tip: "返程前可安排最後一餐" },
    { name: "地鐵直達博多", tip: "約 5 分鐘一班，買一日券更划算" },
  ],
  神社: [
    { name: "參道商店街", tip: "預留 1–2 小時慢慢逛" },
    { name: "周边庭園", tip: "早晨人較少，適合拍照" },
  ],
  公園: [
    { name: "湖上划船", tip: "大濠公園可租船，傍晚景色佳" },
    { name: "周邊咖啡廳", tip: "適合排進下午空檔" },
  ],
  塔: [
    { name: "百道海濱", tip: "傍晚看夕陽，與福岡塔同一區" },
    { name: "海濱公園", tip: "散步吹海風，夏季有活動" },
  ],
};

const DEFAULT_FOODS: Food[] = [
  { name: "當地定食／食堂", tip: "看店內客層，避開純觀光客菜單" },
  { name: "便利店在地限定", tip: "福岡限定零食可當伴手禮" },
  { name: "車站地下美食", tip: "移動日午餐的好選擇" },
];

const DEFAULT_SIGHTS: Sight[] = [
  { name: "步行 10 分鐘圈", tip: "通常有隱藏小店與神社" },
  { name: "附近車站商圈", tip: "藥妝、伴手禮可集中採買" },
];

function matchByKeyword<T extends { name: string }>(
  name: string,
  table: Record<string, T[]>
): T[] {
  for (const [keyword, items] of Object.entries(table)) {
    if (name.includes(keyword)) return items;
  }
  return [];
}

export function buildFallbackRecommendations(
  spotName: string,
  notes: string | null
): Pick<SpotRecommendations, "summary" | "foods" | "sights"> {
  const foods = matchByKeyword(spotName, FOOD_BY_KEYWORD);
  const sights = matchByKeyword(spotName, SIGHT_BY_KEYWORD);

  const summaryParts = [
    `${spotName} 是這趟旅程值得停留的一站。`,
    notes ? notes : "建議預留彈性時間，方便品嚐在地小吃或拍照。",
    "以下為 PlanT 內建推薦。點「AI 設定」選擇 ChatGPT、Gemini 或 Claude 並輸入 API Key，可獲得更個人化的建議。",
  ];

  return {
    summary: summaryParts.join(" "),
    foods: foods.length > 0 ? foods : DEFAULT_FOODS,
    sights: sights.length > 0 ? sights : DEFAULT_SIGHTS,
  };
}
