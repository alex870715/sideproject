import { NextRequest, NextResponse } from "next/server";
import { isValidSeedCode, jsonError, normalizeSeedCode } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeTrip } from "@/lib/trip-serializer";

type RouteContext = { params: Promise<{ seedCode: string }> };

export async function GET(
  _request: NextRequest,
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
        spots: {
          include: { member: true },
          orderBy: { sortOrder: "asc" },
        },
        members: true,
      },
    });

    if (!trip) {
      return jsonError("Trip not found", 404);
    }

    return NextResponse.json(serializeTrip(trip));
  } catch (error) {
    console.error("GET /api/trip/[seedCode]", error);
    return jsonError("Failed to fetch trip", 500);
  }
}
