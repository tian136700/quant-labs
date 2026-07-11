import { beijingDateString } from "@/lib/jp-vocab-daily-check";

export type JpVocabTeacherQuizLive = {
  /** 北京时间 YYYY-MM-DD */
  date: string;
  /** 老师抽查卡片当前词条 id */
  word_id: number | null;
  updated_at: string | null;
  /** 学生自行查看的词条 id（须与 word_id 一致才在老师端提示） */
  student_peek_word_id: number | null;
  student_peek_by: string | null;
  student_peek_at: string | null;
};

export const JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY: JpVocabTeacherQuizLive = {
  date: beijingDateString(),
  word_id: null,
  updated_at: null,
  student_peek_word_id: null,
  student_peek_by: null,
  student_peek_at: null,
};

export function normalizeJpVocabTeacherQuizLive(
  raw: Partial<JpVocabTeacherQuizLive> | null | undefined,
  now = new Date()
): JpVocabTeacherQuizLive {
  const today = beijingDateString(now);
  if (raw?.date !== today) {
    return { ...JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY, date: today };
  }
  const wordId = Number(raw.word_id);
  const peekId = Number(raw.student_peek_word_id);
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
  };
}

export function isJpVocabTeacherQuizLiveStudentPeeked(
  live: JpVocabTeacherQuizLive,
  wordId: number
): boolean {
  const target = Math.floor(wordId);
  return (
    live.word_id === target &&
    live.student_peek_word_id === target &&
    Boolean(live.student_peek_at)
  );
}
