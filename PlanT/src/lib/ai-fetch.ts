import { aiRequestHeaders } from "@/lib/client-settings";

export async function plantAiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const aiHeaders = aiRequestHeaders();
  for (const [k, v] of Object.entries(aiHeaders)) {
    if (typeof v === "string") headers.set(k, v);
  }
  return fetch(input, { ...init, headers });
}
