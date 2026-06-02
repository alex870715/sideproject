"use client";

import { MapPin, Utensils, Flame } from "lucide-react";
import { popularityLabel } from "@/lib/discover/catalog";
import type { DiscoverCard } from "@/types/discover";

type SwipeCardProps = {
  card: DiscoverCard;
  style?: React.CSSProperties;
};

export function SwipeCard({ card, style }: SwipeCardProps) {
  const isFood = card.category === "food";

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-emerald-200 bg-white shadow-2xl"
      style={style}
    >
      <div
        className={
          isFood
            ? "bg-gradient-to-br from-amber-400 via-orange-300 to-amber-200 px-6 py-10 text-white"
            : "bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 px-6 py-10 text-white"
        }
      >
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur">
            {isFood ? (
              <span className="flex items-center gap-1">
                <Utensils className="h-3 w-3" /> 美食
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> 景點
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-xs font-bold">
            <Flame className="h-3 w-3" />
            {card.popularity}
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-bold leading-tight">{card.name}</h2>
        {card.area && (
          <p className="mt-1 text-sm text-white/90">{card.area}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          <p className="text-sm leading-relaxed text-emerald-900/90">
            {card.description}
          </p>
          <p className="mt-3 text-xs font-semibold text-amber-800">
            {popularityLabel(card.popularity)}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          ← 跳過 · 想去 →
        </p>
      </div>
    </div>
  );
}
