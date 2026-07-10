import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { shareJpVocabWord, unshareJpVocabWord } from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";

const AUTH_MSG = {
  en: "Please log in to share words.",
  zh: "请登录后再共享。",
};

const PERM_MSG = {
  en: "Only admin or Japanese teachers can share words.",
  zh: "仅管理员或日语老师可共享单词。",
};

const UNSHARE_AUTH_MSG = {
  en: "Please log in to unshare words.",
  zh: "请登录后再取消共享。",
};

const UNSHARE_PERM_MSG = {
  en: "Only admin or Japanese teachers can unshare words.",
  zh: "仅管理员或日语老师可取消共享。",
};

async function parseWordId(request: Request): Promise<number | null> {
  const body = (await request.json()) as { word_id?: number };
  const wordId = Number(body.word_id);
  if (!Number.isInteger(wordId) || wordId <= 0) return null;
  return wordId;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? PERM_MSG[locale] : AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const wordId = await parseWordId(request);
    if (wordId == null) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    const result = await shareJpVocabWord(env.DB, wordId, user.username);
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

export async function DELETE(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? UNSHARE_PERM_MSG[locale] : UNSHARE_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const wordId = await parseWordId(request);
    if (wordId == null) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    const result = await unshareJpVocabWord(env.DB, wordId);
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "not_shared_today"
            ? 409
            : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({
      ok: true,
      word: result.word,
      reverted: result.reverted,
      display_order: result.display_order,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
