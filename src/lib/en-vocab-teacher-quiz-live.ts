import { beijingDateString } from "@/lib/en-vocab-daily-check";

export type EnVocabTeacherQuizLive = {
  /** 北京时间 YYYY-MM-DD */
  date: string;
  /** 老师抽查卡片当前词条 id */
  word_id: number | null;
  updated_at: string | null;
  /** 学生自行查看的词条 id（须与 word_id 一致才在老师端提示） */
  student_peek_word_id: number | null;
  student_peek_by: string | null;
  student_peek_at: string | null;
  /** 老师「发送读音」：推给学生端本机 TTS（非音频文件） */
  pronounce_word_id: number | null;
  pronounce_text: string | null;
  pronounce_at: string | null;
};

/** shared / study 载荷里的轻量读音信号 */
export type EnVocabTeacherPronounceSignal = {
  word_id: number;
  text: string;
  at: string;
};

export const EN_VOCAB_TEACHER_QUIZ_LIVE_EMPTY: EnVocabTeacherQuizLive = {
  date: beijingDateString(),
  word_id: null,
  updated_at: null,
  student_peek_word_id: null,
  student_peek_by: null,
  student_peek_at: null,
  pronounce_word_id: null,
  pronounce_text: null,
  pronounce_at: null,
};

export function normalizeEnVocabTeacherQuizLive(
  raw: Partial<EnVocabTeacherQuizLive> | null | undefined,
  now = new Date()
): EnVocabTeacherQuizLive {
  const today = beijingDateString(now);
  if (raw?.date !== today) {
    return { ...EN_VOCAB_TEACHER_QUIZ_LIVE_EMPTY, date: today };
  }
  const wordId = Number(raw.word_id);
  const peekId = Number(raw.student_peek_word_id);
  const pronounceId = Number(raw.pronounce_word_id);
  const pronounceText =
    typeof raw.pronounce_text === "string" ? raw.pronounce_text.trim() : "";
  const pronounceAt =
    typeof raw.pronounce_at === "string" && raw.pronounce_at.trim()
      ? raw.pronounce_at.trim()
      : null;
  return {
    date: today,
    word_id: Number.isFinite(wordId) && wordId > 0 ? Math.floor(wordId) : null,
    updated_at:
      typeof raw.updated_at === "string" && raw.updated_at.trim()
        ? raw.updated_at.trim()
        : null,
    student_peek_word_id:
      Number.isFinite(peekId) && peekId > 0 ? Math.floor(peekId) : null,
    student_peek_by:
      typeof raw.student_peek_by === "string" && raw.student_peek_by.trim()
        ? raw.student_peek_by.trim()
        : null,
    student_peek_at:
      typeof raw.student_peek_at === "string" && raw.student_peek_at.trim()
        ? raw.student_peek_at.trim()
        : null,
    pronounce_word_id:
      Number.isFinite(pronounceId) && pronounceId > 0
        ? Math.floor(pronounceId)
        : null,
    pronounce_text: pronounceText || null,
    pronounce_at: pronounceAt,
  };
}

export function isEnVocabTeacherQuizLiveStudentPeeked(
  live: EnVocabTeacherQuizLive,
  wordId: number
): boolean {
  const target = Math.floor(wordId);
  return (
    live.word_id === target &&
    live.student_peek_word_id === target &&
    Boolean(live.student_peek_at)
  );
}

export function enVocabTeacherPronounceFromLive(
  live: EnVocabTeacherQuizLive
): EnVocabTeacherPronounceSignal | null {
  const wordId = live.pronounce_word_id;
  const text = (live.pronounce_text || "").trim();
  const at = (live.pronounce_at || "").trim();
  if (wordId == null || wordId <= 0 || !text || !at) return null;
  return { word_id: wordId, text, at };
}
