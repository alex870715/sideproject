import { NextRequest, NextResponse } from "next/server";
import { isValidSeedCode, jsonError, normalizeSeedCode } from "@/lib/api";
import { getAiCredentialsFromRequest } from "@/lib/ai-credentials";
import { generateFairyTaleBooklet } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ seedCode: string }> };

function formatItinerary(
  title: string,
  startDate: Date,
  endDate: Date,
  trunkSpots: {
    name: string;
    scheduledAt: Date | null;
    openHours: string | null;
    notes: string | null;
  }[],
  sproutSpots: {
    name: string;
    memberName: string | null;
    notes: string | null;
  }[]
): string {
  const lines: string[] = [
    `Title: ${title}`,
    `Dates: ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`,
    "",
    "🌳 Trunk Route (Main):",
  ];

  if (trunkSpots.length === 0) {
    lines.push("  (no spots yet)");
  } else {
    trunkSpots.forEach((s, i) => {
      const when = s.scheduledAt
        ? s.scheduledAt.toLocaleString("zh-TW", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;
      lines.push(`  ${i + 1}. ${s.name}${when ? ` @ ${when}` : ""}`);
      if (s.openHours) lines.push(`     Hours: ${s.openHours}`);
      if (s.notes) lines.push(`     Notes: ${s.notes}`);
    });
  }

  lines.push("", "🌱 Sprout Branches (Personal):");
  if (sproutSpots.length === 0) {
    lines.push("  (no sprouts yet)");
  } else {
    sproutSpots.forEach((s, i) => {
      lines.push(
        `  ${i + 1}. ${s.name}${s.memberName ? ` (by ${s.memberName})` : ""}`
      );
      if (s.notes) lines.push(`     Notes: ${s.notes}`);
    });
  }

  return lines.join("\n");
}

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
        spots: {
          include: { member: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!trip) {
      return jsonError("Trip not found", 404);
    }

    const trunkSpots = trip.spots.filter((s) => s.isTrunk);
    const sproutSpots = trip.spots.filter((s) => !s.isTrunk);

    const itinerary = formatItinerary(
      trip.title,
      trip.startDate,
      trip.endDate,
      trunkSpots,
      sproutSpots.map((s) => ({
        name: s.name,
        memberName: s.member?.name ?? null,
        notes: s.notes,
      }))
    );

    const credentials = getAiCredentialsFromRequest(request);
    const markdown = await generateFairyTaleBooklet(
      trip.title,
      itinerary,
      credentials?.provider,
      credentials?.apiKey
    );

    return NextResponse.json({
      seedCode: trip.seedCode,
      title: trip.title,
      markdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/trip/[seedCode]/generate-booklet", error);
    const message =
      error instanceof Error
        ? error.message
        : "無法生成小冊";
    return jsonError(message, 500);
  }
}
