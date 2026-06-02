import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ spotId: string }> };

export async function PATCH(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { spotId } = await context.params;

    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
    });

    if (!spot) {
      return jsonError("Spot not found", 404);
    }

    if (spot.isTrunk) {
      return jsonError("Spot is already on the Trunk route", 400);
    }

    const trunkCount = await prisma.spot.count({
      where: { tripId: spot.tripId, isTrunk: true },
    });

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: {
        isTrunk: true,
        memberId: null,
        sortOrder: trunkCount,
      },
      include: { member: true },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      isTrunk: updated.isTrunk,
      sortOrder: updated.sortOrder,
      message: "Sprout grafted to Trunk successfully 🌿",
    });
  } catch (error) {
    console.error("PATCH /api/spot/[spotId]/graft", error);
    return jsonError("Failed to graft spot", 500);
  }
}
