import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { listEnVocabWordsChangedSince } from "@/lib/en-vocab-db";

export async function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";

  try {
    const env = await getCloudflareEnv();
    const words = await listEnVocabWordsChangedSince(env.DB, since);
    return jsonResponse(
      { ok: true, words },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
