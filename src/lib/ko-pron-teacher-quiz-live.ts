import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/** 老师当前抽查卡片 → 学生端「今日韩语发音」实时同步 */
export type KoPronTeacherQuizLive = {
  /** 北京时间 YYYY-MM-DD */
  date: string;
  /** 老师当前卡片字母 id */
  letter_id: number | null;
  /** 老师已勾选熟悉程度后，学生端可显示罗马音 */
  reading_revealed: boolean;
  updated_at: string | null;
};

export const KO_PRON_TEACHER_QUIZ_LIVE_EMPTY: KoPronTeacherQuizLive = {
  date: beijingDateString(),
  letter_id: null,
  reading_revealed: false,
  updated_at: null,
};

export function normalizeKoPronTeacherQuizLive(
  raw: Partial<KoPronTeacherQuizLive> | null | undefined,
  now = new Date()
): KoPronTeacherQuizLive {
  const today = beijingDateString(now);
  if (raw?.date !== today) {
    return { ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY, date: today };
  }
  const letterId = Number(raw.letter_id);
  return {
    date: today,
    letter_id:
      Number.isFinite(letterId) && letterId > 0 ? Math.floor(letterId) : null,
    reading_revealed: Boolean(raw.reading_revealed),
    updated_at:
      typeof raw.updated_at === "string" && raw.updated_at.trim()
        ? raw.updated_at.trim()
        : null,
  };
}
