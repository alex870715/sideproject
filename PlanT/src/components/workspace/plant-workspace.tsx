"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { TripMap } from "@/components/workspace/trip-map";
import { AiSettingsDialog } from "@/components/settings/ai-settings-dialog";
import { StorybookModal } from "@/components/workspace/storybook-modal";
import { MembersPanel } from "@/components/workspace/members-panel";
import { SpotDiscoverDialog } from "@/components/workspace/spot-discover-dialog";
import { TimelinePanel } from "@/components/workspace/timeline-panel";
import type { SpotDto, TripDto } from "@/types/trip";

type PlantWorkspaceProps = {
  seedCode: string;
};

export function PlantWorkspace({ seedCode }: PlantWorkspaceProps) {
  const [trip, setTrip] = useState<TripDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discoverSpot, setDiscoverSpot] = useState<SpotDto | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [mapDayId, setMapDayId] = useState("all");

  const fetchTrip = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip/${seedCode}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Trip not found");
      }
      setTrip(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [seedCode]);

  useEffect(() => {
    void fetchTrip();
  }, [fetchTrip]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error ?? "Trip not found"}</p>
        <Link href="/" className="text-emerald-700 hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-emerald-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-emerald-950">PlanT Workspace</h1>
            <p className="text-xs text-emerald-600">
              {new Date(trip.startDate).toLocaleDateString()} –{" "}
              {new Date(trip.endDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AiSettingsDialog />
          <StorybookModal seedCode={trip.seedCode} />
        </div>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-2 lg:items-start lg:p-6">
        <div className="flex min-w-0 flex-col gap-4">
          <MembersPanel trip={trip} onTripUpdate={setTrip} />
          <TimelinePanel
            trip={trip}
            onTripUpdate={setTrip}
            onDaySelect={setMapDayId}
            onDiscoverSpot={(spot) => {
              setDiscoverSpot(spot);
              setDiscoverOpen(true);
            }}
          />
        </div>
        {/* 右欄：正方形地圖，不跟左側時間軸等高拉伸 */}
        <div className="w-full lg:sticky lg:top-4 lg:self-start">
          <div className="mx-auto aspect-square w-full max-w-[min(100%,520px)] lg:max-w-none">
            <TripMap
              spots={trip.spots}
              tripTitle={trip.title}
              tripStartDate={trip.startDate}
              tripEndDate={trip.endDate}
              selectedDayId={mapDayId}
              onDayChange={setMapDayId}
              onSpotSelect={(spot) => {
                setDiscoverSpot(spot);
                setDiscoverOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      <SpotDiscoverDialog
        spot={discoverSpot}
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
      />
    </div>
  );
}
