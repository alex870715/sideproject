import { BUSAN_CARDS } from "@/lib/discover/cards/busan";
import { FUKUOKA_CARDS } from "@/lib/discover/cards/fukuoka";
import { OSAKA_CARDS } from "@/lib/discover/cards/osaka";
import { SEOUL_CARDS } from "@/lib/discover/cards/seoul";
import { TAIPEI_CARDS } from "@/lib/discover/cards/taipei";
import { TOKYO_CARDS } from "@/lib/discover/cards/tokyo";
import type { DiscoverCard, DiscoverDestination } from "@/types/discover";

export const DESTINATIONS: DiscoverDestination[] = [
  { slug: "taipei", label: "台北", emoji: "🧋", center: { lat: 25.033, lng: 121.565 } },
  { slug: "tokyo", label: "東京", emoji: "🗼", center: { lat: 35.6762, lng: 139.6503 } },
  { slug: "osaka", label: "大阪", emoji: "🐙", center: { lat: 34.6937, lng: 135.5023 } },
  { slug: "fukuoka", label: "福岡", emoji: "🍜", center: { lat: 33.59, lng: 130.4 } },
  { slug: "seoul", label: "首爾", emoji: "🇰🇷", center: { lat: 37.5665, lng: 126.978 } },
  { slug: "busan", label: "釜山", emoji: "🌊", center: { lat: 35.1796, lng: 129.0756 } },
];

const DECKS: Record<string, Omit<DiscoverCard, "id">[]> = {
  taipei: TAIPEI_CARDS,
  tokyo: TOKYO_CARDS,
  osaka: OSAKA_CARDS,
  fukuoka: FUKUOKA_CARDS,
  seoul: SEOUL_CARDS,
  busan: BUSAN_CARDS,
};

function normalizeDestination(input: string): string {
  const q = input.trim().toLowerCase();
  if (q.includes("福岡") || q.includes("fukuoka") || q === "博多") return "fukuoka";
  if (q.includes("台北") || q.includes("taipei") || q.includes("臺北")) return "taipei";
  if (q.includes("東京") || q.includes("tokyo")) return "tokyo";
  if (q.includes("大阪") || q.includes("osaka")) return "osaka";
  if (q.includes("首爾") || q.includes("首尔") || q.includes("seoul")) return "seoul";
  if (q.includes("釜山") || q.includes("busan") || q.includes("부산")) return "busan";
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
  const raw = DECKS[slug];

  if (!meta || !raw) return null;

  const cards = withIds(raw, slug).sort((a, b) => b.popularity - a.popularity);
  return { destination: meta, cards };
}

export function popularityLabel(score: number): string {
  if (score >= 90) return "🔥 爆紅";
  if (score >= 80) return "📈 熱門";
  if (score >= 65) return "👍 推薦";
  return "🌱 小眾";
}
