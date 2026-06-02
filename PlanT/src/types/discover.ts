export type DiscoverCategory = "food" | "spot";

export type DiscoverCard = {
  id: string;
  name: string;
  category: DiscoverCategory;
  description: string;
  /** 社群聲量指數 0–100（MVP 以 curated + 規則模擬） */
  popularity: number;
  latitude: number;
  longitude: number;
  tags: string[];
  area?: string;
};

export type DiscoverDestination = {
  slug: string;
  label: string;
  emoji: string;
  center: { lat: number; lng: number };
};

export type PlantTripFromDiscoverBody = {
  destination: string;
  title?: string;
  memberName?: string;
  days?: number;
  liked: DiscoverCard[];
};
