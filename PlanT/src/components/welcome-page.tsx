"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf, Sprout } from "lucide-react";
import { AiSettingsDialog } from "@/components/settings/ai-settings-dialog";
import { TripDateFields } from "@/components/trip-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDefaultTripDateRange,
  tripRangeToIso,
  validateTripDateRange,
} from "@/lib/trip-dates";

export function WelcomePage() {
  const router = useRouter();
  const [seedCode, setSeedCode] = useState("");
  const defaultRange = getDefaultTripDateRange();
  const [tripStart, setTripStart] = useState(defaultRange.start);
  const [tripEnd, setTripEnd] = useState(defaultRange.end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadTrip() {
    const code = seedCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Please enter a valid 6-character seed code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Trip not found");
      }
      router.push(`/trip/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlantNewTrip() {
    const dateError = validateTripDateRange(tripStart, tripEnd);
    if (dateError) {
      setError(dateError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = tripRangeToIso(tripStart, tripEnd);

      const res = await fetch("/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My PlanT Journey",
          startDate,
          endDate,
          memberName: "Explorer",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create trip");
      }

      const trip = await res.json();
      router.push(`/trip/${trip.seedCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to plant trip");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <AiSettingsDialog />
      </div>
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 shadow-inner">
            <Leaf className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-950 sm:text-4xl">
            PlanT 🌱
          </h1>
          <p className="text-lg text-emerald-800/80">
            Plant Your Next Journey
          </p>
          <p className="text-sm text-muted-foreground">
            Grow group itineraries together — branch into personal Sprouts, then
            graft the best picks back to the Trunk.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-emerald-200/80 bg-white/80 p-6 shadow-lg shadow-emerald-100/50 backdrop-blur">
          <label className="block text-left text-sm font-medium text-emerald-900">
            Enter Seed Code
          </label>
          <Input
            placeholder="e.g. ABC123"
            value={seedCode}
            onChange={(e) =>
              setSeedCode(e.target.value.toUpperCase().slice(0, 6))
            }
            onKeyDown={(e) => e.key === "Enter" && handleLoadTrip()}
            className="text-center font-mono text-lg tracking-widest uppercase"
            maxLength={6}
          />
          <Button
            className="w-full"
            onClick={handleLoadTrip}
            disabled={loading || seedCode.length !== 6}
          >
            Load Trip
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-emerald-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">or</span>
            </div>
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

          <Button
            variant="secondary"
            className="w-full"
            onClick={handlePlantNewTrip}
            disabled={loading || !tripStart || !tripEnd}
          >
            <Sprout className="mr-1" />
            Plant a New Trip
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-emerald-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" asChild>
            <Link
              href={`/discover?start=${tripStart}&end=${tripEnd}`}
            >
              🌸 Match 探索
              <span className="sr-only">：滑卡選景點與美食，再建立旅程</span>
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            依目的地滑卡選景點與美食，再建立 PlanT 旅程
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
