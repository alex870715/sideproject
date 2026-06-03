import type { SpotDto } from "@/types/trip";

export type SpotDayGroup = {
  id: string;
  label: string;
  dayIndex: number | null;
  dateKey: string;
  spots: SpotDto[];
};

/** 以使用者本地日曆產生 YYYY-MM-DD（避免 toISOString 時區錯位） */
export function dateKeyFromIso(iso: string): string {
  return dateKeyFromLocalDate(new Date(iso));
}

export function dateKeyFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function compareSpotsInGroup(a: SpotDto, b: SpotDto): number {
  if (a.scheduledAt && b.scheduledAt) {
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  }
  return a.sortOrder - b.sortOrder;
}

export function sortSpotsChronologically(spots: SpotDto[]): SpotDto[] {
  return [...spots].sort(compareSpotsInGroup);
}

/** 當日行程的第一站（與時間軸排序一致） */
export function getLeadingSpot(spots: SpotDto[]): SpotDto | undefined {
  return sortSpotsChronologically(spots)[0];
}

export function groupSpotsByDay(
  spots: SpotDto[],
  tripStartDate: string,
  tripEndDate: string
): SpotDayGroup[] {
  const tripStartMidnight = new Date(tripStartDate);
  tripStartMidnight.setHours(0, 0, 0, 0);
  const tripEndMidnight = new Date(tripEndDate);
  tripEndMidnight.setHours(0, 0, 0, 0);
  const msPerDay = 86400000;
  const dayCount = Math.max(
    1,
    Math.round(
      (tripEndMidnight.getTime() - tripStartMidnight.getTime()) / msPerDay
    ) + 1
  );

  const unscheduled = spots
    .filter((s) => !s.scheduledAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const groups: SpotDayGroup[] = [];

  for (let i = 0; i < dayCount; i++) {
    const dayDate = new Date(tripStartMidnight);
    dayDate.setDate(tripStartMidnight.getDate() + i);
    const key = dateKeyFromLocalDate(dayDate);

    const daySpots = spots
      .filter((s) => s.scheduledAt && dateKeyFromIso(s.scheduledAt) === key)
      .sort(compareSpotsInGroup);

    groups.push({
      id: `day-${key}`,
      label: `Day ${i + 1} · ${dayDate.toLocaleDateString("zh-TW", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      })}`,
      dayIndex: i,
      dateKey: key,
      spots: daySpots,
    });
  }

  const knownKeys = new Set(groups.map((g) => g.dateKey));
  const extraDates = new Map<string, SpotDto[]>();
  for (const spot of spots) {
    if (!spot.scheduledAt) continue;
    const key = dateKeyFromIso(spot.scheduledAt);
    if (knownKeys.has(key)) continue;
    if (!extraDates.has(key)) extraDates.set(key, []);
    extraDates.get(key)!.push(spot);
  }
  for (const [key, daySpots] of extraDates) {
    const d = new Date(daySpots[0].scheduledAt!);
    groups.push({
      id: `day-${key}`,
      label: d.toLocaleDateString("zh-TW", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      }),
      dayIndex: null,
      dateKey: key,
      spots: daySpots.sort(compareSpotsInGroup),
    });
  }

  groups.sort((a, b) => {
    if (a.dateKey === "unscheduled") return 1;
    if (b.dateKey === "unscheduled") return -1;
    return a.dateKey.localeCompare(b.dateKey);
  });

  if (unscheduled.length > 0) {
    groups.push({
      id: "unscheduled",
      label: "📋 未排時間",
      dayIndex: null,
      dateKey: "unscheduled",
      spots: unscheduled,
    });
  }

  return groups;
}

export function flattenGroups(groups: SpotDayGroup[]): SpotDto[] {
  return groups.flatMap((g) => g.spots);
}

export type MapDayFilter = {
  id: string;
  label: string;
  shortLabel: string;
  trunkSpots: SpotDto[];
  sproutSpots: SpotDto[];
};

/** Build map day tabs from all spots (trunk + sprouts grouped by date). */
export function buildMapDayFilters(
  spots: SpotDto[],
  tripStartDate: string,
  tripEndDate: string
): MapDayFilter[] {
  const trunk = spots.filter((s) => s.isTrunk);
  const sprouts = spots.filter((s) => !s.isTrunk);
  const trunkGroups = groupSpotsByDay(trunk, tripStartDate, tripEndDate);
  const sproutGroups = groupSpotsByDay(sprouts, tripStartDate, tripEndDate);

  const sproutByDateKey = new Map(
    sproutGroups.map((g) => [g.dateKey, g.spots])
  );

  const filters: MapDayFilter[] = [
    {
      id: "all",
      label: "全部行程",
      shortLabel: "全部",
      trunkSpots: flattenGroups(trunkGroups),
      sproutSpots: flattenGroups(sproutGroups),
    },
  ];

  for (const g of trunkGroups) {
    if (g.dateKey === "unscheduled") continue;
    filters.push({
      id: g.id,
      label: g.label,
      shortLabel: g.label.replace(/^Day (\d+).*/, "Day $1") || g.label,
      trunkSpots: sortSpotsChronologically(g.spots),
      sproutSpots: sortSpotsChronologically(
        sproutByDateKey.get(g.dateKey) ?? []
      ),
    });
  }

  const unscheduledTrunk =
    trunkGroups.find((g) => g.dateKey === "unscheduled")?.spots ?? [];
  const unscheduledSprouts =
    sproutGroups.find((g) => g.dateKey === "unscheduled")?.spots ?? [];
  if (unscheduledTrunk.length + unscheduledSprouts.length > 0) {
    filters.push({
      id: "unscheduled",
      label: "📋 未排時間",
      shortLabel: "未排",
      trunkSpots: unscheduledTrunk,
      sproutSpots: unscheduledSprouts,
    });
  }

  return filters;
}

export function applySpotToDay(
  spot: SpotDto,
  targetDateKey: string,
  tripStartDate: string
): string | null {
  if (targetDateKey === "unscheduled") return null;

  const [y, m, d] = targetDateKey.split("-").map(Number);
  const prev = spot.scheduledAt
    ? new Date(spot.scheduledAt)
    : new Date(tripStartDate);
  const next = new Date(y, m - 1, d, prev.getHours(), prev.getMinutes(), 0, 0);
  return next.toISOString();
}

export function findGroupForSpot(
  groups: SpotDayGroup[],
  spotId: string
): SpotDayGroup | undefined {
  return groups.find((g) => g.spots.some((s) => s.id === spotId));
}

export function isGroupContainerId(groups: SpotDayGroup[], id: string): boolean {
  return groups.some((g) => g.id === id);
}

/** Handle drop on another spot OR on an empty day container (group.id). */
export function reorderGroups(
  groups: SpotDayGroup[],
  activeId: string,
  overId: string
): SpotDayGroup[] {
  const activeGroup = findGroupForSpot(groups, activeId);
  if (!activeGroup) return groups;

  const activeIndex = activeGroup.spots.findIndex((s) => s.id === activeId);
  const activeSpot = activeGroup.spots[activeIndex];
  if (!activeSpot) return groups;

  const targetGroupByContainer = groups.find((g) => g.id === overId);
  if (targetGroupByContainer) {
    if (targetGroupByContainer.id === activeGroup.id) return groups;
    const newActiveSpots = activeGroup.spots.filter((s) => s.id !== activeId);
    const newOverSpots = [...targetGroupByContainer.spots, activeSpot];
    return groups.map((g) => {
      if (g.id === activeGroup.id) return { ...g, spots: newActiveSpots };
      if (g.id === targetGroupByContainer.id) return { ...g, spots: newOverSpots };
      return g;
    });
  }

  const overGroup = findGroupForSpot(groups, overId);
  if (!overGroup) return groups;

  const overIndex = overGroup.spots.findIndex((s) => s.id === overId);

  if (activeGroup.id === overGroup.id) {
    return groups.map((g) =>
      g.id === activeGroup.id
        ? {
            ...g,
            spots: arrayMove(g.spots, activeIndex, overIndex),
          }
        : g
    );
  }

  const newActiveSpots = activeGroup.spots.filter((s) => s.id !== activeId);
  const newOverSpots = [...overGroup.spots];
  newOverSpots.splice(overIndex, 0, activeSpot);

  return groups.map((g) => {
    if (g.id === activeGroup.id) return { ...g, spots: newActiveSpots };
    if (g.id === overGroup.id) return { ...g, spots: newOverSpots };
    return g;
  });
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function buildReorderPayload(
  groups: SpotDayGroup[],
  tripStartDate: string
): { id: string; sortOrder: number; scheduledAt: string | null }[] {
  const flat = flattenGroups(groups);
  return flat.map((spot, index) => {
    const group = findGroupForSpot(groups, spot.id)!;
    return {
      id: spot.id,
      sortOrder: index,
      scheduledAt: applySpotToDay(spot, group.dateKey, tripStartDate),
    };
  });
}
