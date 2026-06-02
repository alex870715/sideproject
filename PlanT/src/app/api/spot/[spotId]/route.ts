import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeSpot } from "@/lib/spot-serializer";
import type { UpdateSpotBody } from "@/types/trip";

type RouteContext = { params: Promise<{ spotId: string }> };

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { spotId } = await context.params;
    const body = (await request.json()) as UpdateSpotBody;

    const spot = await prisma.spot.findUnique({ where: { id: spotId } });
    if (!spot) return jsonError("Spot not found", 404);

    if (body.name !== undefined && !body.name.trim()) {
      return jsonError("name cannot be empty", 400);
    }

    let scheduledAt: Date | null | undefined = undefined;
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null) {
        scheduledAt = null;
      } else {
        const d = new Date(body.scheduledAt);
        if (isNaN(d.getTime())) return jsonError("Invalid scheduledAt", 400);
        scheduledAt = d;
      }
    }

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.openHours !== undefined && {
          openHours: body.openHours?.trim() || null,
        }),
        ...(body.phone !== undefined && {
          phone: body.phone?.trim() || null,
        }),
        ...(body.notes !== undefined && {
          notes: body.notes?.trim() || null,
        }),
        ...(scheduledAt !== undefined && { scheduledAt }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
      include: { member: true },
    });

    return NextResponse.json(serializeSpot(updated));
  } catch (error) {
    console.error("PATCH /api/spot/[spotId]", error);
    return jsonError("Failed to update spot", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { spotId } = await context.params;

    const spot = await prisma.spot.findUnique({ where: { id: spotId } });
    if (!spot) return jsonError("Spot not found", 404);

    await prisma.spot.delete({ where: { id: spotId } });

    return NextResponse.json({ success: true, id: spotId });
  } catch (error) {
    console.error("DELETE /api/spot/[spotId]", error);
    return jsonError("Failed to delete spot", 500);
  }
}
