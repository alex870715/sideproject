"use client";

import dynamic from "next/dynamic";
import type { SpotDto } from "@/types/trip";

const TripMapInner = dynamic(
  () => import("./trip-map-inner").then((m) => m.TripMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/30">
        <p className="text-sm text-emerald-700">載入地圖中…</p>
      </div>
    ),
  }
);

type TripMapProps = {
  spots: SpotDto[];
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  onSpotSelect?: (spot: SpotDto) => void;
  selectedDayId?: string;
  onDayChange?: (dayId: string) => void;
};

export function TripMap({
  spots,
  tripTitle,
  tripStartDate,
  tripEndDate,
  onSpotSelect,
  selectedDayId,
  onDayChange,
}: TripMapProps) {
  return (
    <TripMapInner
      spots={spots}
      tripTitle={tripTitle}
      tripStartDate={tripStartDate}
      tripEndDate={tripEndDate}
      onSpotSelect={onSpotSelect}
      selectedDayId={selectedDayId}
      onDayChange={onDayChange}
    />
  );
}
