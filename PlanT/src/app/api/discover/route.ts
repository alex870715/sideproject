import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getDiscoverDeck } from "@/lib/discover/catalog";

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination");

  if (!destination?.trim()) {
    return jsonError("destination query is required", 400);
  }

  const deck = getDiscoverDeck(destination);
  if (!deck) {
    return jsonError(
      "尚無此地區的探索資料，目前支援：福岡、台北、大阪",
      404
    );
  }

  return NextResponse.json({
    destination: deck.destination,
    cards: deck.cards,
    total: deck.cards.length,
  });
}
