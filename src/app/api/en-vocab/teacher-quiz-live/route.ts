import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnVocabTeacherQuizLive,
  peekEnVocabTeacherQuizLiveWord,
  sendEnVocabTeacherQuizLivePronounce,
  setEnVocabTeacherQuizLiveWord,
} from "@/lib/en-vocab-db";
import {
  requireEnVocabAccess,
  requireEnVocabStudyAccess,
} from "@/lib/en-vocab-auth";
import { isEnVocabTeacherQuizLiveStudentPeeked } from "@/lib/en-vocab-teacher-quiz-live";
import { touchAuthUserActivityIpFromRequest } from "@/lib/etr-auth-db";

const TEACHER_AUTH_MSG = {
  en: "Please log in as a teacher.",
  zh: "请使用老师账号登录。",
};

const TEACHER_PERM_MSG = {
  en: "Only admin or English teachers can update live quiz state.",
  zh: "仅管理员或英语老师可更新抽查状态。",
};

const STUDY_AUTH_MSG = {
  en: "Only admin or authorized students can peek the live quiz word.",
  zh: "仅管理员或已授权学生可查看老师正在抽查的单词。",
};

const NO_ACTIVE_WORD_MSG = {
  en: "The teacher is not quizzing a word right now (or sync is still catching up). Please try again in a few seconds.",
  zh: "老师当前没有在抽查单词（或同步尚未完成），请过几秒再点一次。",
};

const WORD_NOT_FOUND_MSG = {
  en: "Word not found.",
  zh: "单词不存在或已失效。",
};

const PRONOUNCE_MISMATCH_MSG = {
  en: "Please send pronunciation for the word currently on the quiz card.",
  zh: "请对当前抽查卡片上的单词发送读音。",
};

const PRONOUNCE_EMPTY_MSG = {
  en: "This word has no text to pronounce.",
  zh: "该词条没有可朗读的英文文本。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const wordIdRaw = url.searchParams.get("word_id");
  const wordId = wordIdRaw != null ? Number(wordIdRaw) : NaN;

  try {
    if (scope === "study") {
      const { env, allowed } = await requireEnVocabStudyAccess(request);
      if (!allowed) {
        return jsonResponse({ ok: false, error: STUDY_AUTH_MSG[locale] }, 401);
      }

      const live = await getEnVocabTeacherQuizLive(env.DB, new Date(), {
        bypassCache: true,
      });
      return jsonResponse(
        {
          ok: true,
          live: { word_id: live.word_id },
        },
        200,
        { "Cache-Control": "no-store" }
      );
    }

    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const live = await getEnVocabTeacherQuizLive(env.DB);
    const student_peeked =
      Number.isFinite(wordId) && wordId > 0
        ? isEnVocabTeacherQuizLiveStudentPeeked(live, Math.floor(wordId))
        : false;

    return jsonResponse(
      {
        ok: true,
        live,
        student_peeked,
        student_peek_by: student_peeked ? live.student_peek_by : null,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function PUT(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    let body: { word_id?: unknown; action?: unknown };
    try {
      body = (await request.json()) as { word_id?: unknown; action?: unknown };
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    if (body.action === "send_pronounce") {
      const parsed = Number(body.word_id);
      const wordId =
        Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
      if (!wordId) {
        return jsonResponse({ ok: false, error: "Invalid word_id" }, 400);
      }
      const result = await sendEnVocabTeacherQuizLivePronounce(env.DB, wordId);
      if (!result.ok) {
        const error =
          result.error === "no_active_word"
            ? NO_ACTIVE_WORD_MSG[locale]
            : result.error === "word_mismatch"
              ? PRONOUNCE_MISMATCH_MSG[locale]
              : result.error === "empty_word"
                ? PRONOUNCE_EMPTY_MSG[locale]
                : WORD_NOT_FOUND_MSG[locale];
        const status =
          result.error === "word_mismatch" || result.error === "empty_word"
            ? 400
            : 404;
        return jsonResponse({ ok: false, error, code: result.error }, status);
      }
      return jsonResponse({
        ok: true,
        live: result.live,
        teacher_pronounce: result.signal,
      });
    }

    let wordId: number | null = null;
    if (body.word_id == null) {
      wordId = null;
    } else {
      const parsed = Number(body.word_id);
      wordId =
        Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
    }

    const live = await setEnVocabTeacherQuizLiveWord(env.DB, wordId);
    // 抽查 live 换词/开卡：刷新用户管理「最近 IP」（节流，失败不挡主流程）
    if (wordId != null) {
      await touchAuthUserActivityIpFromRequest(env.DB, user, request);
    }
    return jsonResponse({ ok: true, live });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabStudyAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: STUDY_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const result = await peekEnVocabTeacherQuizLiveWord(env.DB, user.username);
    if (!result.ok) {
      const error =
        result.error === "no_active_word"
          ? NO_ACTIVE_WORD_MSG[locale]
          : WORD_NOT_FOUND_MSG[locale];
      return jsonResponse({ ok: false, error, code: result.error }, 404);
    }

    return jsonResponse({
      ok: true,
      item: result.item,
      refs: result.refs,
      word: result.word,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
