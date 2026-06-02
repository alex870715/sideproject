import { NextRequest, NextResponse } from "next/server";
import { isValidSeedCode, jsonError, normalizeSeedCode } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeTrip } from "@/lib/trip-serializer";

type RouteContext = { params: Promise<{ seedCode: string }> };

type ReorderItem = {
  id: string;
  sortOrder: number;
  scheduledAt?: string | null;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { seedCode: raw } = await context.params;
    const seedCode = normalizeSeedCode(raw);

    if (!isValidSeedCode(seedCode)) {
      return jsonError("Invalid seed code format", 400);
    }

    const body = (await request.json()) as {
      isTrunk: boolean;
      items: ReorderItem[];
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError("items array is required", 400);
    }

    const trip = await prisma.trip.findUnique({
      where: { seedCode },
      include: { spots: true },
    });

    if (!trip) return jsonError("Trip not found", 404);

    const branchSpots = trip.spots.filter((s) => s.isTrunk === body.isTrunk);
    const branchIds = new Set(branchSpots.map((s) => s.id));

    for (const item of body.items) {
      if (!branchIds.has(item.id)) {
        return jsonError(`Spot ${item.id} not in this branch`, 400);
      }
    }

    await prisma.$transaction(
      body.items.map((item) => {
        let scheduledAt: Date | null | undefined = undefined;
        if (item.scheduledAt !== undefined) {
          scheduledAt =
            item.scheduledAt === null ? null : new Date(item.scheduledAt);
        }
        return prisma.spot.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            ...(scheduledAt !== undefined && { scheduledAt }),
          },
        });
      })
    );

    const updated = await prisma.trip.findUnique({
      where: { seedCode },
      include: {
        spots: { include: { member: true }, orderBy: { sortOrder: "asc" } },
        members: true,
      },
    });

    return NextResponse.json(serializeTrip(updated!));
  } catch (error) {
    console.error("PATCH /api/trip/[seedCode]/reorder", error);
    return jsonError("Failed to reorder spots", 500);
  }
}
