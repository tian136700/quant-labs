import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listEnVocabReviewLog } from "@/lib/en-vocab-db";
import { requireEnVocabRead } from "@/lib/en-vocab-auth";
import { jsonResponseObserving1102 } from "@/lib/worker-1102-observe";

const READ_MSG = {
  en: "Please log in to view review history.",
  zh: "请登录后查看勾选记录。",
};

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const locale = localeFromRequest(request);

  try {
    const url = new URL(request.url);
    const wordId = Number(url.searchParams.get("word_id"));
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: "word_id_invalid" },
        400
      );
    }

    const { env, allowed } = await requireEnVocabRead(request);
    if (!allowed) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: READ_MSG[locale] },
        401
      );
    }

    const items = await listEnVocabReviewLog(env.DB, wordId, limit);
    return jsonResponseObserving1102(
      request,
      startedAtMs,
      { ok: true, items },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponseObserving1102(
      request,
      startedAtMs,
      { ok: false, error: message },
      500
    );
  }
}
