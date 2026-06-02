import {
  getAiCredentialsFromRequest,
  resolveAiCredentials,
  type AiCredentials,
} from "@/lib/ai-credentials";
import { aiComplete } from "@/lib/ai-providers/complete";
import { buildFallbackRecommendations } from "@/lib/spot-recommendations-fallback";

export type SpotRecommendations = {
  summary: string;
  foods: { name: string; tip: string }[];
  sights: { name: string; tip: string }[];
  photoUrl: string | null;
  photoCredit: string | null;
  source: "ai" | "fallback";
  provider?: string;
  aiError?: string;
};

async function fetchWikipediaPhoto(query: string): Promise<{
  url: string | null;
  credit: string | null;
}> {
  const clean = query.replace(/\(.*\)/, "").trim().split(/[·&]/)[0].trim();
  const tries = [clean, query.trim()];

  for (const lang of ["zh", "ja", "en"]) {
    for (const title of tries) {
      try {
        const encoded = encodeURIComponent(title);
        const res = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
          { cache: "force-cache", next: { revalidate: 86400 } }
        );
        if (!res.ok) continue;
        const data = (await res.json()) as {
          thumbnail?: { source: string };
          originalimage?: { source: string };
          title?: string;
        };
        const url =
          data.thumbnail?.source ?? data.originalimage?.source ?? null;
        if (url) {
          return {
            url,
            credit: `Wikipedia (${lang}) · ${data.title ?? title}`,
          };
        }
      } catch {
        continue;
      }
    }
  }
  return { url: null, credit: null };
}

async function generateWithAi(
  credentials: AiCredentials,
  spotName: string,
  latitude: number,
  longitude: number,
  notes: string | null
): Promise<Pick<SpotRecommendations, "summary" | "foods" | "sights">> {
  const raw = await aiComplete(credentials, {
    system: `You are a local travel guide for PlanT. Return JSON only:
{
  "summary": "2-3 sentences in Traditional Chinese about this place",
  "foods": [{"name":"...", "tip":"short tip in zh-TW"}],
  "sights": [{"name":"...", "tip":"short tip in zh-TW"}]
}
Provide 3-4 foods and 2-3 nearby sights. Be specific to the location.`,
    user: `Place: ${spotName}\nCoordinates: ${latitude}, ${longitude}\nNotes: ${notes ?? "none"}`,
    jsonMode: true,
    temperature: 0.7,
  });

  let parsed: {
    summary?: string;
    foods?: { name: string; tip: string }[];
    sights?: { name: string; tip: string }[];
  } = {};

  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }

  return {
    summary: parsed.summary ?? "探索這個景點的美好時光。",
    foods: parsed.foods ?? [],
    sights: parsed.sights ?? [],
  };
}

export async function generateSpotRecommendations(
  spotName: string,
  latitude: number,
  longitude: number,
  notes: string | null,
  provider?: string | null,
  apiKey?: string | null
): Promise<SpotRecommendations> {
  const photo = await fetchWikipediaPhoto(spotName);
  const credentials = resolveAiCredentials(provider, apiKey);

  let content: Pick<SpotRecommendations, "summary" | "foods" | "sights">;
  let source: SpotRecommendations["source"] = "fallback";
  let providerLabel: string | undefined;
  let aiError: string | undefined;

  if (credentials) {
    try {
      content = await generateWithAi(
        credentials,
        spotName,
        latitude,
        longitude,
        notes
      );
      source = "ai";
      providerLabel = credentials.provider;
    } catch (error) {
      console.warn("AI recommendations failed, using fallback:", error);
      aiError =
        error instanceof Error ? error.message : "AI 推薦失敗";
      content = buildFallbackRecommendations(spotName, notes);
    }
  } else {
    content = buildFallbackRecommendations(spotName, notes);
  }

  return {
    ...content,
    photoUrl: photo.url,
    photoCredit: photo.credit,
    source,
    provider: providerLabel,
    aiError,
  };
}

export { getAiCredentialsFromRequest };
