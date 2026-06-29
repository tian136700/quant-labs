import type { JpLessonNote, JpLessonRecord, JpLessonTeacher, JpVocabRef, JpVocabWord } from "@/lib/types";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import {
  computeJpVocabDailyDisplayOrder,
  normalizeJpVocabRoundCheckedIds,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";

export const JP_VOCAB_CACHE_KEY = "jp-api:vocab:v3";
export const JP_LESSON_CACHE_KEY = "jp-api:lesson:v4";

export type JpVocabApiPayload = {
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  daily_quiz_style: JpVocabDailyQuizStyle;
  display_order: JpVocabDailyDisplayOrder;
};

export type JpLessonApiPayload = {
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  notes: JpLessonNote[];
  teachers?: JpLessonTeacher[];
};

export function parseJpVocabApi(json: unknown): JpVocabApiPayload {
  const data = json as {
    ok?: boolean;
    words?: JpVocabWord[];
    refs?: Record<string, JpVocabRef>;
    daily_quiz_style?: Partial<JpVocabDailyQuizStyle>;
    display_order?: Partial<JpVocabDailyDisplayOrder>;
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.words)) {
    throw new Error(data.error || "加载失败");
  }
  const words = data.words.map((word) => ({
    ...word,
    today_check_count: word.today_check_count ?? 0,
  }));
  const display_order =
    data.display_order?.date && Array.isArray(data.display_order.ids)
      ? {
          date: data.display_order.date,
          ids: data.display_order.ids.map((id) => Number(id)).filter((id) => id > 0),
          round_checked_ids: Object.prototype.hasOwnProperty.call(
            data.display_order,
            "round_checked_ids"
          )
            ? normalizeJpVocabRoundCheckedIds(
                data.display_order.round_checked_ids
              )
            : words
                .filter(
                  (w) =>
                    effectiveTodayCheckCount(
                      w.today_check_count ?? 0,
                      w.today_check_date
                    ) > 0
                )
                .map((w) => w.id),
        }
      : {
          date: beijingDateString(),
          ids: computeJpVocabDailyDisplayOrder(words),
          round_checked_ids: [],
        };
  return {
    words,
    refs: data.refs ?? {},
    daily_quiz_style: normalizeJpVocabDailyQuizStyle(
      data.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT
    ),
    display_order,
  };
}

export function parseJpLessonApi(json: unknown): JpLessonApiPayload {
  const data = json as {
    ok?: boolean;
    lessons?: JpLessonRecord[];
    refs?: Record<string, JpVocabRef>;
    notes?: JpLessonNote[];
    teachers?: JpLessonTeacher[];
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.lessons)) {
    throw new Error(data.error || "加载失败");
  }
  return {
    lessons: data.lessons.map((lesson) => {
      const legacyTeacherId = (lesson as { teacher_id?: number | null }).teacher_id;
      const teacherIds = Array.isArray(lesson.teacher_ids)
        ? lesson.teacher_ids.map((id) => Number(id)).filter((id) => id > 0)
        : legacyTeacherId != null
          ? [Number(legacyTeacherId)]
          : [];
      return {
        ...lesson,
        learning: Boolean(lesson.learning),
        teacher_ids: teacherIds,
        teacher_other:
          lesson.teacher_other != null && String(lesson.teacher_other).trim()
            ? String(lesson.teacher_other).trim()
            : null,
      };
    }),
    refs: data.refs ?? {},
    notes: data.notes ?? [],
    teachers: data.teachers,
  };
}
