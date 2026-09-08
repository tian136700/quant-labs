import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnVocabClassNotes,
  getEnVocabTeacherQuizLive,
  isEnVocabWordSharedToday,
  updateEnVocabClassNotes,
} from "@/lib/en-vocab-db";
import {
  requireEnVocabAccess,
  requireEnVocabRead,
  requireEnVocabStudyAccess,
} from "@/lib/en-vocab-auth";
import { jsonResponseObserving1102 } from "@/lib/worker-1102-observe";

const AUTH_MSG = {
  en: "Please log in to edit class notes.",
  zh: "请登录后再编辑课堂笔记。",
};

const READ_MSG = {
  en: "Please log in to view class notes.",
  zh: "请登录后查看课堂笔记。",
};

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const locale = localeFromRequest(request);

  try {
    const wordId = Number(new URL(request.url).searchParams.get("word_id"));
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: "word_id_invalid" },
        400
      );
    }

    const read = await requireEnVocabRead(request);
    let env = read.env;
    let allowed = read.allowed;
    if (!allowed) {
      const study = await requireEnVocabStudyAccess(request);
      env = study.env;
      if (study.allowed) {
        const [sharedToday, live] = await Promise.all([
          isEnVocabWordSharedToday(env.DB, wordId),
          getEnVocabTeacherQuizLive(env.DB, new Date(), { bypassCache: true }),
        ]);
        allowed = sharedToday || live.word_id === wordId;
      }
    }
    if (!allowed) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: READ_MSG[locale] },
        401
      );
    }

    const result = await getEnVocabClassNotes(env.DB, wordId);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: result.error },
        status
      );
    }

    return jsonResponseObserving1102(
      request,
      startedAtMs,
      { ok: true, word: result.word },
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

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      word_id?: number;
      class_notes?: string | null;
    };

    const wordId = Number(body.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
    }

    const result = await updateEnVocabClassNotes(
      env.DB,
      wordId,
      body.class_notes ?? null,
      user.username
    );

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
