import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getDiscoverDeck } from "@/lib/discover/catalog";
import { prisma } from "@/lib/prisma";
import { generateUniqueSeedCode } from "@/lib/seed-code";
import { serializeTrip } from "@/lib/trip-serializer";
import type { PlantTripFromDiscoverBody } from "@/types/discover";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PlantTripFromDiscoverBody;

    if (!body.destination?.trim()) {
      return jsonError("destination is required", 400);
    }
    if (!Array.isArray(body.liked) || body.liked.length === 0) {
      return jsonError("liked must contain at least one card", 400);
    }

    const deck = getDiscoverDeck(body.destination);
    const destLabel = deck?.destination.label ?? body.destination;
    const days = Math.min(Math.max(body.days ?? 5, 1), 14);

    const startDate = new Date();
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    endDate.setHours(18, 0, 0, 0);

    const seedCode = await generateUniqueSeedCode();
    const title =
      body.title?.trim() || `${destLabel} 探索之旅 🌿`;

    const trip = await prisma.trip.create({
      data: {
        seedCode,
        title,
        startDate,
        endDate,
        members: {
          create: { name: body.memberName?.trim() || "探索隊長" },
        },
      },
    });

    const spotsPerDay = Math.ceil(body.liked.length / days);

    for (let i = 0; i < body.liked.length; i++) {
      const card = body.liked[i];
      const dayOffset = Math.min(Math.floor(i / spotsPerDay), days - 1);
      const scheduledAt = new Date(startDate);
      scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
      scheduledAt.setHours(10 + (i % spotsPerDay) * 2, 0, 0, 0);

      await prisma.spot.create({
        data: {
          tripId: trip.id,
          name: card.name,
          latitude: card.latitude,
          longitude: card.longitude,
          notes: `${card.category === "food" ? "🍽️" : "📍"} ${card.description} · 聲量 ${card.popularity}`,
          openHours: card.category === "food" ? "建議預約或離峰" : undefined,
          scheduledAt,
          isTrunk: true,
          sortOrder: i,
        },
      });
    }

    const full = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        spots: { include: { member: true }, orderBy: { sortOrder: "asc" } },
        members: true,
      },
    });

    return NextResponse.json(
      {
        trip: serializeTrip(full!),
        seedCode,
        redirectUrl: `/trip/${seedCode}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/discover/plant-trip", error);
    return jsonError("Failed to plant trip from discover", 500);
  }
}
