import { NextRequest, NextResponse } from "next/server";
import { isValidSeedCode, jsonError, normalizeSeedCode } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeSpot } from "@/lib/spot-serializer";
import type { CreateSpotBody } from "@/types/trip";

type RouteContext = { params: Promise<{ seedCode: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { seedCode: raw } = await context.params;
    const seedCode = normalizeSeedCode(raw);

    if (!isValidSeedCode(seedCode)) {
      return jsonError("Invalid seed code format", 400);
    }

    const trip = await prisma.trip.findUnique({
      where: { seedCode },
      include: {
        spots: { select: { sortOrder: true } },
        members: { select: { id: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!trip) {
      return jsonError("Trip not found", 404);
    }

    const body = (await request.json()) as CreateSpotBody;

    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      return jsonError("latitude and longitude are required numbers", 400);
    }

    const isTrunk = body.isTrunk !== false;
    let memberId: string | null = body.memberId ?? null;

    if (!isTrunk) {
      if (memberId) {
        const member = await prisma.member.findFirst({
          where: { id: memberId, tripId: trip.id },
        });
        if (!member) {
          return jsonError("Member not found on this trip", 404);
        }
      } else if (body.memberName?.trim()) {
        const member = await prisma.member.create({
          data: { tripId: trip.id, name: body.memberName.trim() },
        });
        memberId = member.id;
      } else if (trip.members.length > 0) {
        memberId = trip.members[0].id;
      } else {
        const member = await prisma.member.create({
          data: { tripId: trip.id, name: "Sprout Explorer" },
        });
        memberId = member.id;
      }
    }

    const maxOrder = trip.spots.reduce(
      (max, s) => Math.max(max, s.sortOrder),
      -1
    );

    let scheduledAt: Date | null = null;
    if (body.scheduledAt) {
      const d = new Date(body.scheduledAt);
      if (!isNaN(d.getTime())) scheduledAt = d;
    }

    const spot = await prisma.spot.create({
      data: {
        tripId: trip.id,
        memberId: isTrunk ? null : memberId,
        name: body.name.trim(),
        latitude: body.latitude,
        longitude: body.longitude,
        openHours: body.openHours?.trim() || null,
        phone: body.phone?.trim() || null,
        notes: body.notes?.trim() || null,
        scheduledAt,
        isTrunk,
        sortOrder: maxOrder + 1,
      },
      include: { member: true },
    });

    return NextResponse.json(serializeSpot(spot), { status: 201 });
  } catch (error) {
    console.error("POST /api/trip/[seedCode]/spot", error);
    return jsonError("Failed to add spot", 500);
  }
}
