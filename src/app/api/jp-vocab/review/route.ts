import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  clearJpVocabReviewDone,
  recordJpVocabReviewDone,
  getJpVocabReviewProgress,
} from "@/lib/jp-vocab-db";
import { requireAdmin } from "@/lib/admin-auth";

const AUTH_MSG = {
  en: "Admin only.",
  zh: "仅管理员可用。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 403);
    }
    const env = await getCloudflareEnv();
    const review_progress = await getJpVocabReviewProgress(env.DB);
    return jsonResponse({ ok: true, review_progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 403);
    }
    const env = await getCloudflareEnv();
    const body = (await request.json()) as {
      action?: string;
      word_id?: number;
    };

    if (body.action === "review_next") {
      const wordId = Number(body.word_id);
      if (!Number.isFinite(wordId) || wordId <= 0) {
        return jsonResponse({ ok: false, error: "invalid word_id" }, 400);
      }
      const review_progress = await recordJpVocabReviewDone(env.DB, wordId);
      return jsonResponse({ ok: true, review_progress });
    }

    if (body.action === "clear") {
      const review_progress = await clearJpVocabReviewDone(env.DB);
      return jsonResponse({ ok: true, review_progress });
    }

    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
