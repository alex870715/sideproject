import { NextRequest, NextResponse } from "next/server";
import { isValidSeedCode, jsonError, normalizeSeedCode } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { CreateMemberBody } from "@/types/trip";

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

    const trip = await prisma.trip.findUnique({ where: { seedCode } });
    if (!trip) return jsonError("Trip not found", 404);

    const body = (await request.json()) as CreateMemberBody;
    if (!body.name?.trim()) {
      return jsonError("name is required", 400);
    }

    const member = await prisma.member.create({
      data: {
        tripId: trip.id,
        name: body.name.trim(),
        email: body.email?.trim() || null,
      },
    });

    return NextResponse.json(
      { id: member.id, name: member.name, email: member.email },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trip/[seedCode]/member", error);
    return jsonError("Failed to add member", 500);
  }
}
