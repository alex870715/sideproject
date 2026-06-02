"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Loader2,
  Sparkles,
  ThumbsDown,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwipeCard } from "@/components/discover/swipe-card";
import { TripDateFields } from "@/components/trip-date-fields";
import { DESTINATIONS } from "@/lib/discover/catalog";
import {
  getDefaultTripDateRange,
  tripRangeToIso,
  validateTripDateRange,
} from "@/lib/trip-dates";
import type { DiscoverCard, DiscoverDestination } from "@/types/discover";

function initialTripDates(searchParams: URLSearchParams) {
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start && end && validateTripDateRange(start, end) === null) {
    return { start, end };
  }
  return getDefaultTripDateRange();
}

type Step = "destination" | "swipe" | "summary" | "planting";

export function DiscoverFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tripStart, setTripStart] = useState(() =>
    initialTripDates(searchParams).start
  );
  const [tripEnd, setTripEnd] = useState(() =>
    initialTripDates(searchParams).end
  );
  const [step, setStep] = useState<Step>("destination");
  const [destinationInput, setDestinationInput] = useState("福岡");
  const [meta, setMeta] = useState<DiscoverDestination | null>(null);
  const [deck, setDeck] = useState<DiscoverCard[]>([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<DiscoverCard[]>([]);
  const [passed, setPassed] = useState<DiscoverCard[]>([]);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");

  const current = deck[index];
  const progress = deck.length ? index / deck.length : 0;

  async function startDiscover(dest?: string) {
    const q = (dest ?? destinationInput).trim();
    if (!q) return;
    const dateError = validateTripDateRange(tripStart, tripEnd);
    if (dateError) {
      setError(dateError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/discover?destination=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "載入失敗");

      setMeta(data.destination);
      setDeck(data.cards);
      setIndex(0);
      setLiked([]);
      setPassed([]);
      setStep("swipe");
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  function handleSwipe(direction: "left" | "right") {
    if (!current) return;
    setSwipeDir(direction);
    setTimeout(() => {
      if (direction === "right") {
        setLiked((prev) => [...prev, current]);
      } else {
        setPassed((prev) => [...prev, current]);
      }
      setSwipeDir(null);
      if (index + 1 >= deck.length) {
        setStep("summary");
      } else {
        setIndex((i) => i + 1);
      }
    }, 280);
  }

  async function plantTrip() {
    if (liked.length === 0) return;
    const dateError = validateTripDateRange(tripStart, tripEnd);
    if (dateError) {
      setError(dateError);
      return;
    }
    setStep("planting");
    setError(null);
    try {
      const { startDate, endDate } = tripRangeToIso(tripStart, tripEnd);
      const res = await fetch("/api/discover/plant-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: meta?.label ?? destinationInput,
          memberName: memberName.trim() || undefined,
          startDate,
          endDate,
          liked,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立失敗");
      router.push(data.redirectUrl ?? `/trip/${data.seedCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
      setStep("summary");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50 via-white to-amber-50/30">
      <header className="flex items-center justify-between border-b border-emerald-100 bg-white/80 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          PlanT 首頁
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold text-emerald-950">PlanT Match 🌿</p>
          <p className="text-[10px] text-emerald-600">探索模式 · 獨立體驗</p>
        </div>
        <div className="w-16" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        {step === "destination" && (
          <div className="flex flex-1 flex-col justify-center space-y-6">
            <div className="text-center">
              <p className="text-4xl">🌸</p>
              <h1 className="mt-2 text-2xl font-bold text-emerald-950">
                先來場「目的地約會」
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                像交友 App 一樣左滑跳過、右滑收藏。
                <br />
                卡片依<strong>社群聲量</strong>排序（MVP 模擬資料）。
              </p>
            </div>

            <TripDateFields
              start={tripStart}
              end={tripEnd}
              onStartChange={(v) => {
                setTripStart(v);
                if (tripEnd && v > tripEnd) setTripEnd(v);
              }}
              onEndChange={setTripEnd}
              disabled={loading}
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-emerald-800">
                目的地
              </label>
              <Input
                placeholder="例：福岡、台北、大阪"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startDiscover()}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {DESTINATIONS.map((d) => (
                <button
                  key={d.slug}
                  type="button"
                  onClick={() => {
                    setDestinationInput(d.label);
                    void startDiscover(d.label);
                  }}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm shadow-sm hover:bg-emerald-50"
                >
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => startDiscover()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  開始滑動探索
                </>
              )}
            </Button>

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </div>
        )}

        {step === "swipe" && current && (
          <div className="flex flex-1 flex-col">
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs text-emerald-700">
                <span>
                  {meta?.emoji} {meta?.label}
                </span>
                <span>
                  {index + 1} / {deck.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                <span className="text-rose-600">✕ {passed.length}</span>
                <span className="text-emerald-600">♥ {liked.length}</span>
              </p>
            </div>

            <div className="relative mx-auto aspect-[3/4] w-full max-w-sm flex-1">
              {deck[index + 1] && (
                <SwipeCard
                  card={deck[index + 1]}
                  style={{
                    transform: "scale(0.95) translateY(8px)",
                    opacity: 0.5,
                    zIndex: 0,
                  }}
                />
              )}
              <SwipeCard
                card={current}
                style={{
                  zIndex: 1,
                  transform:
                    swipeDir === "left"
                      ? "translateX(-120%) rotate(-12deg)"
                      : swipeDir === "right"
                        ? "translateX(120%) rotate(12deg)"
                        : undefined,
                  opacity: swipeDir ? 0 : 1,
                  transition: "transform 0.28s ease, opacity 0.28s ease",
                }}
              />
            </div>

            <div className="mt-6 flex justify-center gap-6 pb-4">
              <Button
                variant="outline"
                size="lg"
                className="h-14 w-14 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => handleSwipe("left")}
                aria-label="跳過"
              >
                <ThumbsDown className="h-6 w-6" />
              </Button>
              <Button
                size="lg"
                className="h-16 w-16 rounded-full bg-emerald-600 shadow-lg hover:bg-emerald-700"
                onClick={() => handleSwipe("right")}
                aria-label="想去"
              >
                <Heart className="h-7 w-7 fill-current" />
              </Button>
            </div>
          </div>
        )}

        {step === "summary" && (
          <div className="flex flex-1 flex-col space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-emerald-950">
                大家的精選 ✨
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                共收藏 {liked.length} 個 · 略過 {passed.length} 個
              </p>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-800">
                <Users className="h-3 w-3" />
                你的名字（選填）
              </label>
              <Input
                placeholder="探索隊長"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
              />
            </div>

            <ul className="max-h-[40vh] flex-1 space-y-2 overflow-y-auto">
              {liked.map((card, i) => (
                <li
                  key={card.id}
                  className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {card.name}
                  </span>
                  <span className="text-[10px] text-amber-700">
                    🔥{card.popularity}
                  </span>
                </li>
              ))}
            </ul>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("swipe");
                  setIndex(0);
                  setLiked([]);
                  setPassed([]);
                }}
              >
                重新滑
              </Button>
              <Button
                className="flex-1"
                disabled={liked.length === 0}
                onClick={plantTrip}
              >
                建立 PlanT 旅程 →
              </Button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground">
              將自動建立主幹行程，之後可在 Workspace 拖曳、嫁接、AI 規劃
            </p>
          </div>
        )}

        {step === "planting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
            <p className="font-medium text-emerald-800">
              正在把你的選擇種成 PlanT 旅程…
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
