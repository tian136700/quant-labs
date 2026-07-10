import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  getJpVocabTeacherVisibleLimit,
  listJpVocabWordsChangedSince,
} from "@/lib/jp-vocab-db";

export async function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";

  try {
    const env = await getCloudflareEnv();
    const [words, teacher_visible_limit] = await Promise.all([
      listJpVocabWordsChangedSince(env.DB, since),
      getJpVocabTeacherVisibleLimit(env.DB),
    ]);
    return jsonResponse(
      { ok: true, words, teacher_visible_limit },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
