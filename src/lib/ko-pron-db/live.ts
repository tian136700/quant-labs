import "server-only";

import type { KoPronLetter } from "@/lib/types";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  KO_PRON_TEACHER_QUIZ_LIVE_EMPTY,
  normalizeKoPronTeacherQuizLive,
  type KoPronTeacherQuizLive,
} from "@/lib/ko-pron-teacher-quiz-live";
import { TEACHER_QUIZ_LIVE_KEY } from "./state";
import { getSettingRaw, setSettingRaw } from "./helpers";
import { getKoPronLetterById } from "./letters";

export async function getKoPronTeacherQuizLive(
  db: D1Database,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const raw = await getSettingRaw(db, TEACHER_QUIZ_LIVE_KEY);
  if (!raw) return { ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY, date: beijingDateString(now) };
  try {
    return normalizeKoPronTeacherQuizLive(JSON.parse(raw), now);
  } catch {
    return { ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY, date: beijingDateString(now) };
  }
}

async function saveKoPronTeacherQuizLive(
  db: D1Database,
  live: KoPronTeacherQuizLive
): Promise<KoPronTeacherQuizLive> {
  const next = normalizeKoPronTeacherQuizLive(live);
  await setSettingRaw(db, TEACHER_QUIZ_LIVE_KEY, JSON.stringify(next));
  return next;
}

/** 老师打开/切换抽查卡片：写入当前字母，罗马音对学生隐藏 */
export async function setKoPronTeacherQuizLiveLetter(
  db: D1Database,
  letterId: number | null,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const current = await getKoPronTeacherQuizLive(db, now);
  const parsedId =
    letterId != null && Number.isFinite(letterId) && letterId > 0
      ? Math.floor(letterId)
      : null;
  const letterChanged = current.letter_id !== parsedId;
  const next: KoPronTeacherQuizLive = {
    date: beijingDateString(now),
    letter_id: parsedId,
    reading_revealed: letterChanged ? false : current.reading_revealed,
    updated_at: parsedId != null ? now.toISOString() : null,
  };
  if (!letterChanged && parsedId != null) {
    next.reading_revealed = current.reading_revealed;
    next.updated_at = now.toISOString();
  }
  return saveKoPronTeacherQuizLive(db, next);
}

/** 老师勾选熟悉程度后：对学生端揭示罗马音 */
export async function revealKoPronTeacherQuizLiveReading(
  db: D1Database,
  letterId: number,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const current = await getKoPronTeacherQuizLive(db, now);
  const id = Math.floor(letterId);
  if (current.letter_id !== id) {
    return saveKoPronTeacherQuizLive(db, {
      date: beijingDateString(now),
      letter_id: id,
      reading_revealed: true,
      updated_at: now.toISOString(),
    });
  }
  return saveKoPronTeacherQuizLive(db, {
    ...current,
    reading_revealed: true,
    updated_at: now.toISOString(),
  });
}

export type KoPronStudyLivePayload = {
  live: KoPronTeacherQuizLive;
  letter: KoPronLetter | null;
  /** 对学生端脱敏：未揭示时 reading 为 null */
  student_letter: {
    id: number;
    letter: string;
    reading: string | null;
    meaning: string | null;
    category: string | null;
  } | null;
};

export async function getKoPronStudyLivePayload(
  db: D1Database,
  now = new Date()
): Promise<KoPronStudyLivePayload> {
  const live = await getKoPronTeacherQuizLive(db, now);
  if (!live.letter_id) {
    return { live, letter: null, student_letter: null };
  }
  const letter = await getKoPronLetterById(db, live.letter_id);
  if (!letter) {
    return { live, letter: null, student_letter: null };
  }
  return {
    live,
    letter,
    student_letter: {
      id: letter.id,
      letter: letter.letter,
      reading: live.reading_revealed ? letter.reading : null,
      meaning: live.reading_revealed ? letter.meaning : null,
      category: letter.category,
    },
  };
}
