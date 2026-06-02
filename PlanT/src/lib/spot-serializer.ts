import type { Member, Spot } from "@prisma/client";
import type { SpotDto } from "@/types/trip";

export function serializeSpot(spot: Spot & { member?: Member | null }): SpotDto {
  return {
    id: spot.id,
    name: spot.name,
    latitude: spot.latitude,
    longitude: spot.longitude,
    openHours: spot.openHours,
    phone: spot.phone,
    notes: spot.notes,
    scheduledAt: spot.scheduledAt?.toISOString() ?? null,
    isTrunk: spot.isTrunk,
    sortOrder: spot.sortOrder,
    memberId: spot.memberId,
    member: spot.member
      ? { id: spot.member.id, name: spot.member.name }
      : null,
  };
}
