import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  listJpVocabWords,
  recordJpVocabReview,
} from "@/lib/jp-vocab-db";
import type { JpVocabLevel } from "@/lib/types";

export async function GET() {
  try {
    const env = await getCloudflareEnv();
    const words = await listJpVocabWords(env.DB);
    return jsonResponse({ ok: true, words });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      word_id?: number;
      level?: JpVocabLevel;
    };

    const wordId = Number(body.word_id);
    const level = body.level;

    if (!level || !["very", "normal", "weak"].includes(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

    const env = await getCloudflareEnv();
    const result = await recordJpVocabReview(env.DB, wordId, level);

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true, word: result.word });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
