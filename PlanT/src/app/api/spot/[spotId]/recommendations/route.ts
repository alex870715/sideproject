import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getAiCredentialsFromRequest } from "@/lib/ai-credentials";
import { generateSpotRecommendations } from "@/lib/spot-recommendations";

type RouteContext = { params: Promise<{ spotId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { spotId } = await context.params;

    const spot = await prisma.spot.findUnique({ where: { id: spotId } });
    if (!spot) return jsonError("Spot not found", 404);

    const credentials = getAiCredentialsFromRequest(_request);

    const data = await generateSpotRecommendations(
      spot.name,
      spot.latitude,
      spot.longitude,
      spot.notes,
      credentials?.provider,
      credentials?.apiKey
    );

    return NextResponse.json({
      spotId: spot.id,
      spotName: spot.name,
      ...data,
    });
  } catch (error) {
    console.error("GET /api/spot/[spotId]/recommendations", error);
    const message =
      error instanceof Error ? error.message : "無法載入推薦";
    return jsonError(message, 500);
  }
}
