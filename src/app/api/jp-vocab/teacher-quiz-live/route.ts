import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getJpVocabTeacherQuizLive,
  peekJpVocabTeacherQuizLiveWord,
  setJpVocabTeacherQuizLiveWord,
} from "@/lib/jp-vocab-db";
import {
  requireJpVocabAccess,
  requireJpVocabStudyAccess,
} from "@/lib/jp-vocab-auth";
import { isJpVocabTeacherQuizLiveStudentPeeked } from "@/lib/jp-vocab-teacher-quiz-live";

const TEACHER_AUTH_MSG = {
  en: "Please log in as a teacher.",
  zh: "请使用老师账号登录。",
};

const TEACHER_PERM_MSG = {
  en: "Only admin or Japanese teachers can update live quiz state.",
  zh: "仅管理员或日语老师可更新抽查状态。",
};

const STUDY_AUTH_MSG = {
  en: "Only admin or authorized students can peek the live quiz word.",
  zh: "仅管理员或已授权学生可查看老师正在抽查的单词。",
};

const NO_ACTIVE_WORD_MSG = {
  en: "The teacher is not quizzing a word right now. Please try again later.",
  zh: "老师当前没有在抽查单词，请稍后再试。",
};

const WORD_NOT_FOUND_MSG = {
  en: "Word not found.",
  zh: "单词不存在或已失效。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const wordIdRaw = new URL(request.url).searchParams.get("word_id");
  const wordId = wordIdRaw != null ? Number(wordIdRaw) : NaN;

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const live = await getJpVocabTeacherQuizLive(env.DB);
    const student_peeked =
      Number.isFinite(wordId) && wordId > 0
        ? isJpVocabTeacherQuizLiveStudentPeeked(live, Math.floor(wordId))
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
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    let wordId: number | null = null;
    try {
      const body = (await request.json()) as { word_id?: unknown };
      if (body.word_id == null) {
        wordId = null;
      } else {
        const parsed = Number(body.word_id);
        wordId =
          Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
      }
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const live = await setJpVocabTeacherQuizLiveWord(env.DB, wordId);
    return jsonResponse({ ok: true, live });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabStudyAccess(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: STUDY_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const result = await peekJpVocabTeacherQuizLiveWord(env.DB, user.username);
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
