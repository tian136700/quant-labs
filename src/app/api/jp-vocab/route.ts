import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  listJpVocabWordsWithRefs,
  recordJpVocabReview,
  resetAllJpVocabReviews,
} from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import type { JpVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export async function GET() {
  try {
    const env = await getCloudflareEnv();
    const { words, refs } = await listJpVocabWordsWithRefs(env.DB);
    return jsonResponse({ ok: true, words, refs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      word_id?: number;
      level?: JpVocabLevel;
    };

    if (body.action === "reset") {
      const result = await resetAllJpVocabReviews(env.DB);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 400);
      }
      return jsonResponse({ ok: true, words: result.words });
    }

    const wordId = Number(body.word_id);
    const level = body.level;

    if (!level || !["very", "normal", "weak"].includes(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

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
