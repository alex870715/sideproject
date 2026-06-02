"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatScheduledAt } from "@/lib/datetime";
import {
  buildMapDayFilters,
  flattenGroups,
  groupSpotsByDay,
  type MapDayFilter,
} from "@/lib/spot-groups";
import { partitionSpots } from "@/lib/spots";
import type { SpotDto } from "@/types/trip";
import "leaflet/dist/leaflet.css";

type TripMapInnerProps = {
  spots: SpotDto[];
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  onSpotSelect?: (spot: SpotDto) => void;
};

function FitBounds({ spots, filterKey }: { spots: SpotDto[]; filterKey: string }) {
  const map = useMap();

  useEffect(() => {
    if (spots.length === 0) return;
    const bounds = L.latLngBounds(
      spots.map((s) => [s.latitude, s.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14 });
  }, [map, spots, filterKey]);

  return null;
}

function createNumberedIcon(label: string, variant: "trunk" | "sprout") {
  const styles =
    variant === "trunk"
      ? { bg: "#059669", border: "#047857", text: "#ffffff", size: 40 }
      : { bg: "#ecfccb", border: "#65a30d", text: "#365314", size: 34 };

  return L.divIcon({
    className: "plant-map-marker",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:${styles.size}px;height:${styles.size}px;border-radius:50%;
      background:${styles.bg};border:3px solid ${styles.border};
      box-shadow:0 2px 10px rgba(0,0,0,0.28);
      font-size:${variant === "trunk" ? "16px" : "13px"};
      font-weight:700;color:${styles.text};font-family:system-ui,sans-serif;
      cursor:pointer;
    ">${label}</div>`,
    iconSize: [styles.size, styles.size],
    iconAnchor: [styles.size / 2, styles.size / 2],
    popupAnchor: [0, -styles.size / 2],
  });
}

function SpotPopup({
  orderLabel,
  spot,
  variant,
  dayLabel,
  onExplore,
}: {
  orderLabel: string;
  spot: SpotDto;
  variant: "trunk" | "sprout";
  dayLabel?: string;
  onExplore?: () => void;
}) {
  return (
    <div className="min-w-[180px] font-sans text-sm">
      {dayLabel && (
        <p className="mb-1 text-[10px] font-medium text-emerald-600">{dayLabel}</p>
      )}
      <p
        className={
          variant === "trunk"
            ? "font-bold text-emerald-800"
            : "font-bold text-lime-800"
        }
      >
        {orderLabel} {spot.name}
      </p>
      <p className="mt-1 text-xs text-gray-600">
        {variant === "trunk" ? "🌳 Trunk 主幹" : "🌱 Sprout 支線"}
        {spot.member ? ` · ${spot.member.name}` : ""}
      </p>
      {formatScheduledAt(spot.scheduledAt) && (
        <p className="mt-1.5 rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">
          📅 {formatScheduledAt(spot.scheduledAt)}
        </p>
      )}
      {spot.openHours && (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          🕐 {spot.openHours}
        </p>
      )}
      {spot.notes && <p className="mt-1 text-xs text-gray-500">{spot.notes}</p>}
      {onExplore && (
        <button
          type="button"
          onClick={onExplore}
          className="mt-2 w-full rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          探索美食與照片 →
        </button>
      )}
    </div>
  );
}

const FUKUOKA_CENTER: [number, number] = [33.59, 130.4];

export function TripMapInner({
  spots,
  tripTitle,
  tripStartDate,
  tripEndDate,
  onSpotSelect,
}: TripMapInnerProps) {
  const dayFilters = useMemo(
    () => buildMapDayFilters(spots, tripStartDate, tripEndDate),
    [spots, tripStartDate, tripEndDate]
  );

  const [selectedDayId, setSelectedDayId] = useState("all");

  useEffect(() => {
    if (!dayFilters.some((f) => f.id === selectedDayId)) {
      setSelectedDayId("all");
    }
  }, [dayFilters, selectedDayId]);

  const activeFilter =
    dayFilters.find((f) => f.id === selectedDayId) ?? dayFilters[0];

  const { trunk: allTrunk, sprouts: allSprouts } = useMemo(
    () => partitionSpots(spots),
    [spots]
  );

  const isAllView = activeFilter.id === "all";

  const visibleTrunk = activeFilter.trunkSpots;
  const visibleSprouts = activeFilter.sproutSpots;
  const visibleAll = [...visibleTrunk, ...visibleSprouts];

  const trunkRoute = useMemo(
    () =>
      visibleTrunk.map(
        (s) => [s.latitude, s.longitude] as [number, number]
      ),
    [visibleTrunk]
  );

  const globalTrunkOrder = useMemo(() => {
    const groups = groupSpotsByDay(allTrunk, tripStartDate, tripEndDate);
    return new Map(
      flattenGroups(groups).map((s, i) => [s.id, String(i + 1)])
    );
  }, [allTrunk, tripStartDate, tripEndDate]);

  const globalSproutOrder = useMemo(() => {
    const groups = groupSpotsByDay(allSprouts, tripStartDate, tripEndDate);
    return new Map(
      flattenGroups(groups).map((s, i) => [s.id, `S${i + 1}`])
    );
  }, [allSprouts, tripStartDate, tripEndDate]);

  const filterIndex = dayFilters.findIndex((f) => f.id === selectedDayId);

  function goPrevDay() {
    if (filterIndex > 0) setSelectedDayId(dayFilters[filterIndex - 1].id);
  }

  function goNextDay() {
    if (filterIndex < dayFilters.length - 1) {
      setSelectedDayId(dayFilters[filterIndex + 1].id);
    }
  }

  const defaultCenter =
    visibleTrunk.length > 0
      ? ([visibleTrunk[0].latitude, visibleTrunk[0].longitude] as [
          number,
          number,
        ])
      : visibleAll.length > 0
        ? ([visibleAll[0].latitude, visibleAll[0].longitude] as [
            number,
            number,
          ])
        : FUKUOKA_CENTER;

  return (
    <div className="relative flex h-full min-h-[360px] flex-col overflow-hidden rounded-xl border border-emerald-200 shadow-sm">
      <MapDayToolbar
        filters={dayFilters}
        selectedId={selectedDayId}
        onSelect={setSelectedDayId}
        onPrev={goPrevDay}
        onNext={goNextDay}
        canPrev={filterIndex > 0}
        canNext={filterIndex < dayFilters.length - 1}
        activeFilter={activeFilter}
      />

      <div className="relative min-h-[300px] flex-1">
        <MapContainer
          key={selectedDayId}
          center={defaultCenter}
          zoom={11}
          className="h-full min-h-[300px] w-full z-0"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds spots={visibleAll} filterKey={selectedDayId} />

          {trunkRoute.length >= 2 && (
            <Polyline
              positions={trunkRoute}
              pathOptions={{
                color: isAllView ? "#059669" : "#10b981",
                weight: isAllView ? 4 : 5,
                opacity: 0.85,
                dashArray: isAllView ? undefined : "0",
              }}
            />
          )}

          {visibleTrunk.map((spot, index) => {
            const order = isAllView
              ? globalTrunkOrder.get(spot.id) ?? "?"
              : String(index + 1);
            return (
              <Marker
                key={spot.id}
                position={[spot.latitude, spot.longitude]}
                icon={createNumberedIcon(order, "trunk")}
                zIndexOffset={1000 + index}
                eventHandlers={{ click: () => onSpotSelect?.(spot) }}
              >
                <Popup>
                  <SpotPopup
                    orderLabel={
                      isAllView ? `第 ${order} 站` : `此日第 ${order} 站`
                    }
                    spot={spot}
                    variant="trunk"
                    dayLabel={isAllView ? undefined : activeFilter.label}
                    onExplore={() => onSpotSelect?.(spot)}
                  />
                </Popup>
              </Marker>
            );
          })}

          {visibleSprouts.map((spot, index) => {
            const label = isAllView
              ? globalSproutOrder.get(spot.id) ?? "S?"
              : `S${index + 1}`;
            return (
              <Marker
                key={spot.id}
                position={[spot.latitude, spot.longitude]}
                icon={createNumberedIcon(label, "sprout")}
                zIndexOffset={500 + index}
                eventHandlers={{ click: () => onSpotSelect?.(spot) }}
              >
                <Popup>
                  <SpotPopup
                    orderLabel={
                      isAllView ? `支線 ${label}` : `此日支線 ${label}`
                    }
                    spot={spot}
                    variant="sprout"
                    dayLabel={isAllView ? undefined : activeFilter.label}
                    onExplore={() => onSpotSelect?.(spot)}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[200px] rounded-lg border border-emerald-200/80 bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur">
          <p className="font-medium text-emerald-900">{tripTitle}</p>
          <p className="mt-0.5 text-emerald-700">{activeFilter.label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            主幹 {visibleTrunk.length} 站
            {visibleSprouts.length > 0
              ? ` · 支線 ${visibleSprouts.length}`
              : ""}
            {!isAllView && " · 依日編號 1→N"}
          </p>
        </div>

        {visibleAll.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-white/70">
            <p className="text-sm text-emerald-800">
              此日尚無景點，請從左側拖曳或新增
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MapDayToolbar({
  filters,
  selectedId,
  onSelect,
  onPrev,
  onNext,
  canPrev,
  canNext,
  activeFilter,
}: {
  filters: MapDayFilter[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  activeFilter: MapDayFilter;
}) {
  return (
    <div className="z-[1001] flex shrink-0 items-center gap-1 border-b border-emerald-100 bg-white/95 px-2 py-2 backdrop-blur">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="前一日"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-thin">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedId === f.id
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
              f.trunkSpots.length + f.sproutSpots.length === 0 &&
                f.id !== "all" &&
                "opacity-50"
            )}
          >
            {f.id === "all" ? "全部" : f.shortLabel}
            {(f.trunkSpots.length > 0 || f.sproutSpots.length > 0) && (
              <span className="ml-1 opacity-80">
                ({f.trunkSpots.length + f.sproutSpots.length})
              </span>
            )}
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onNext}
        disabled={!canNext}
        aria-label="後一日"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <span className="hidden text-[10px] text-emerald-600 sm:inline">
        {activeFilter.trunkSpots.length >= 2 ? "已連線" : ""}
      </span>
    </div>
  );
}
