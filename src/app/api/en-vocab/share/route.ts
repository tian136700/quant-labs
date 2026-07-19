import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { shareEnVocabWord } from "@/lib/en-vocab-db";
import { requireEnVocabAccess } from "@/lib/en-vocab-auth";

const AUTH_MSG = {
  en: "Please log in to share words.",
  zh: "请登录后再共享。",
};

const PERM_MSG = {
  en: "Only admin or English teachers can share words.",
  zh: "仅管理员或英语老师可共享单词。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? PERM_MSG[locale] : AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const body = (await request.json()) as { word_id?: number };
    const wordId = Number(body.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    const result = await shareEnVocabWord(env.DB, wordId, user.username);
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "already_shared_today"
            ? 409
            : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({
      ok: true,
      item: result.item,
      word: result.word,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
