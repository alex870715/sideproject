import type { DiscoverCard, DiscoverDestination } from "@/types/discover";

/** MVP：以 curated 資料 + 聲量分數模擬社群熱度（之後可接 IG/TikTok/Google Trends API） */
const FUKUOKA_CARDS: Omit<DiscoverCard, "id">[] = [
  {
    name: "博多站 & 一蘭拉麵本店",
    category: "spot",
    description: "博多拉麵聖地，排隊名店",
    popularity: 96,
    latitude: 33.5902,
    longitude: 130.4206,
    tags: ["拉麵", "必吃"],
    area: "博多",
  },
  {
    name: "中洲屋台街",
    category: "spot",
    description: "夜間屋台文化，烤串與拉麵",
    popularity: 94,
    latitude: 33.5931,
    longitude: 130.4066,
    tags: ["夜景", "在地"],
    area: "中洲",
  },
  {
    name: "水炊鍋（博多雞肉鍋）",
    category: "food",
    description: "福岡代表鍋物，先喝湯再吃肉",
    popularity: 92,
    latitude: 33.592,
    longitude: 130.408,
    tags: ["鍋物", "必吃"],
    area: "博多",
  },
  {
    name: "太宰府天滿宮",
    category: "spot",
    description: "求學運、梅枝餅參道",
    popularity: 91,
    latitude: 33.5198,
    longitude: 130.5343,
    tags: ["神社", "郊遊"],
    area: "太宰府",
  },
  {
    name: "明太子（ふくや）",
    category: "food",
    description: "福岡名物，伴手禮首選",
    popularity: 89,
    latitude: 33.583,
    longitude: 130.41,
    tags: ["伴手禮"],
    area: "博多",
  },
  {
    name: "Canal City 博多",
    category: "spot",
    description: "購物、噴水秀、美食街",
    popularity: 87,
    latitude: 33.5894,
    longitude: 130.4117,
    tags: ["購物"],
    area: "博多",
  },
  {
    name: "櫛田神社",
    category: "spot",
    description: "博多總鎮守，祇園山笠文化",
    popularity: 85,
    latitude: 33.5916,
    longitude: 130.4103,
    tags: ["神社"],
    area: "博多",
  },
  {
    name: "牛腸鍋",
    category: "food",
    description: "內臟鍋物，在地居酒屋文化",
    popularity: 84,
    latitude: 33.594,
    longitude: 130.405,
    tags: ["居酒屋"],
    area: "中洲",
  },
  {
    name: "由布院 金鱗湖",
    category: "spot",
    description: "溫泉小鎮、晨霧湖景",
    popularity: 88,
    latitude: 33.2631,
    longitude: 131.3542,
    tags: ["溫泉", "一日遊"],
    area: "由布院",
  },
  {
    name: "糸島 櫻井神社",
    category: "spot",
    description: "海邊鳥居、網美海景",
    popularity: 83,
    latitude: 33.5612,
    longitude: 130.1982,
    tags: ["海景", "網美"],
    area: "糸島",
  },
  {
    name: "もつ鍋 楽天地",
    category: "food",
    description: "人氣牛腸鍋連鎖",
    popularity: 82,
    latitude: 33.591,
    longitude: 130.407,
    tags: ["排隊名店"],
    area: "博多",
  },
  {
    name: "福岡塔 & 百道海濱",
    category: "spot",
    description: "地標海景、夕陽拍照",
    popularity: 80,
    latitude: 33.5931,
    longitude: 130.3515,
    tags: ["海景"],
    area: "百道",
  },
  {
    name: "天神地下街",
    category: "spot",
    description: "購物、藥妝、美食",
    popularity: 78,
    latitude: 33.5902,
    longitude: 130.3987,
    tags: ["購物"],
    area: "天神",
  },
  {
    name: "博多餃子（一風堂餃子/長浜市場）",
    category: "food",
    description: "煎餃配啤酒的博多夜生活",
    popularity: 76,
    latitude: 33.595,
    longitude: 130.404,
    tags: ["居酒屋"],
    area: "中洲",
  },
  {
    name: "大濠公園",
    category: "spot",
    description: "城市綠洲、划船野餐",
    popularity: 72,
    latitude: 33.5862,
    longitude: 130.3798,
    tags: ["公園"],
    area: "天神",
  },
  {
    name: "屋台ラーメン（中洲）",
    category: "food",
    description: "路邊攤拉麵體驗",
    popularity: 90,
    latitude: 33.5925,
    longitude: 130.406,
    tags: ["屋台", "夜生活"],
    area: "中洲",
  },
  {
    name: "福岡市博物館",
    category: "spot",
    description: "現代建築與展覽",
    popularity: 58,
    latitude: 33.5942,
    longitude: 130.3755,
    tags: ["博物館"],
    area: "百道",
  },
  {
    name: "スターバックス 太宰府店",
    category: "food",
    description: "網美星巴克建築",
    popularity: 74,
    latitude: 33.518,
    longitude: 130.532,
    tags: ["咖啡", "網美"],
    area: "太宰府",
  },
];

export const DESTINATIONS: DiscoverDestination[] = [
  {
    slug: "fukuoka",
    label: "福岡",
    emoji: "🍜",
    center: { lat: 33.59, lng: 130.4 },
  },
  {
    slug: "taipei",
    label: "台北",
    emoji: "🧋",
    center: { lat: 25.033, lng: 121.565 },
  },
  {
    slug: "osaka",
    label: "大阪",
    emoji: "🐙",
    center: { lat: 34.693, lng: 135.502 },
  },
];

function normalizeDestination(input: string): string {
  const q = input.trim().toLowerCase();
  if (q.includes("福岡") || q.includes("fukuoka") || q === "博多") return "fukuoka";
  if (q.includes("台北") || q.includes("taipei")) return "taipei";
  if (q.includes("大阪") || q.includes("osaka")) return "osaka";
  return q;
}

function withIds(cards: Omit<DiscoverCard, "id">[], prefix: string): DiscoverCard[] {
  return cards.map((c, i) => ({
    ...c,
    id: `${prefix}-${i}`,
  }));
}

export function getDestinationMeta(input: string): DiscoverDestination | null {
  const slug = normalizeDestination(input);
  return DESTINATIONS.find((d) => d.slug === slug) ?? null;
}

export function getDiscoverDeck(destinationInput: string): {
  destination: DiscoverDestination;
  cards: DiscoverCard[];
} | null {
  const slug = normalizeDestination(destinationInput);
  const meta = DESTINATIONS.find((d) => d.slug === slug);

  if (slug === "fukuoka" && meta) {
    const cards = withIds(FUKUOKA_CARDS, "fukuoka").sort(
      (a, b) => b.popularity - a.popularity
    );
    return { destination: meta, cards };
  }

  if (meta) {
    const cards = withIds(
      FUKUOKA_CARDS.slice(0, 8).map((c) => ({
        ...c,
        name: `${meta.label} · ${c.name}`,
        latitude: meta.center.lat + (Math.random() - 0.5) * 0.05,
        longitude: meta.center.lng + (Math.random() - 0.5) * 0.05,
      })),
      slug
    ).sort((a, b) => b.popularity - a.popularity);
    return { destination: meta, cards };
  }

  return null;
}

export function popularityLabel(score: number): string {
  if (score >= 90) return "🔥 爆紅";
  if (score >= 80) return "📈 熱門";
  if (score >= 65) return "👍 推薦";
  return "🌱 小眾";
}
