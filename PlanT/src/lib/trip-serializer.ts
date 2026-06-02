import type { Member, Spot, Trip } from "@prisma/client";
import { serializeSpot } from "@/lib/spot-serializer";
import type { TripDto } from "@/types/trip";

type TripWithRelations = Trip & {
  spots: (Spot & { member: Member | null })[];
  members: Member[];
};

export function serializeTrip(trip: TripWithRelations): TripDto {
  return {
    id: trip.id,
    seedCode: trip.seedCode,
    title: trip.title,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    spots: trip.spots.map((spot) => serializeSpot(spot)),
    members: trip.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
    })),
  };
}
