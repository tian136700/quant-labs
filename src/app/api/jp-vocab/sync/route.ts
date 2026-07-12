import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  getJpVocabTeacherVisibleLimit,
  listJpVocabWordsChangedSince,
} from "@/lib/jp-vocab-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since")?.trim() ?? "";
  const includeLimit = url.searchParams.get("limit") !== "0";

  try {
    const env = await getCloudflareEnv();
    const [words, teacher_visible_limit] = await Promise.all([
      since ? listJpVocabWordsChangedSince(env.DB, since) : Promise.resolve([]),
      includeLimit
        ? getJpVocabTeacherVisibleLimit(env.DB)
        : Promise.resolve(null),
    ]);
    return jsonResponse(
      {
        ok: true,
        words,
        ...(teacher_visible_limit ? { teacher_visible_limit } : {}),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
