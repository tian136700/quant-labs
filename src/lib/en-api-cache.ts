import type { EnLessonNote, EnLessonRecord, EnLessonTeacher, EnVocabRef, EnVocabWord } from "@/lib/types";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeEnVocabDailyQuizStyle,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import {
  computeEnVocabDailyDisplayOrder,
  EN_VOCAB_DAILY_ORDER_ALGO,
  normalizeEnVocabRoundCheckedIds,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import {
  normalizeEnVocabTeacherVisibleLimit,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import { normalizeClassDurationMinutes } from "@/lib/en-lesson-shared";

export const JP_VOCAB_CACHE_KEY = "en-api:vocab:v6";
export const JP_LESSON_CACHE_KEY = "en-api:lesson:v6";
/** 日程管理轻量课表（?view=schedule）；勿与全量 lesson 缓存混用 */
export const EN_LESSON_SCHEDULE_CACHE_KEY = "en-api:lesson-schedule:v1";

/** 词表本地缓存有效期内不重复 GET（多人同时刷新时减轻 Worker 压力） */
export const JP_VOCAB_REFRESH_TTL_MS = 45_000;

export type EnVocabApiPayload = {
  words: EnVocabWord[];
  refs: Record<string, EnVocabRef>;
  daily_quiz_style: EnVocabDailyQuizStyle;
  display_order: EnVocabDailyDisplayOrder;
  /** 今日已共享到「今日背英语单词」的 word_id 列表（北京时间 0 点清空） */
  shared_today_word_ids: number[];
  teacher_visible_limit: EnVocabTeacherVisibleLimit;
};

export type EnLessonApiPayload = {
  lessons: EnLessonRecord[];
  refs: Record<string, EnVocabRef>;
  notes: EnLessonNote[];
  teachers?: EnLessonTeacher[];
};

export function parseEnVocabApi(json: unknown): EnVocabApiPayload {
  const data = json as {
    ok?: boolean;
    words?: EnVocabWord[];
    refs?: Record<string, EnVocabRef>;
    daily_quiz_style?: Partial<EnVocabDailyQuizStyle>;
    display_order?: Partial<EnVocabDailyDisplayOrder>;
    shared_today_word_ids?: number[];
    teacher_visible_limit?: unknown;
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
          order_algo:
            typeof data.display_order.order_algo === "string" &&
            data.display_order.order_algo.trim()
              ? data.display_order.order_algo.trim()
              : undefined,
          round_checked_ids: Object.prototype.hasOwnProperty.call(
            data.display_order,
            "round_checked_ids"
          )
            ? normalizeEnVocabRoundCheckedIds(
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
          ids: computeEnVocabDailyDisplayOrder(words),
          round_checked_ids: [],
          order_algo: EN_VOCAB_DAILY_ORDER_ALGO,
        };
  return {
    words,
    refs: data.refs ?? {},
    daily_quiz_style: normalizeEnVocabDailyQuizStyle(
      data.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT
    ),
    display_order,
    shared_today_word_ids: Array.isArray(data.shared_today_word_ids)
      ? data.shared_today_word_ids.map((id) => Number(id)).filter((id) => id > 0)
      : [],
    teacher_visible_limit: normalizeEnVocabTeacherVisibleLimit(
      data.teacher_visible_limit
    ),
  };
}

export function parseEnLessonApi(json: unknown): EnLessonApiPayload {
  const data = json as {
    ok?: boolean;
    lessons?: EnLessonRecord[];
    refs?: Record<string, EnVocabRef>;
    notes?: EnLessonNote[];
    teachers?: EnLessonTeacher[];
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
        class_schedules: Array.isArray(lesson.class_schedules)
          ? lesson.class_schedules.map((item) => ({
              id: Number(item.id) || 0,
              class_at:
                item.class_at != null && String(item.class_at).trim()
                  ? String(item.class_at).trim()
                  : "",
              duration_minutes: normalizeClassDurationMinutes(
                item.duration_minutes != null ? Number(item.duration_minutes) : null
              ),
            })).filter((item) => item.class_at)
          : [],
        next_class_at:
          lesson.next_class_at != null && String(lesson.next_class_at).trim()
            ? String(lesson.next_class_at).trim()
            : null,
        class_duration_minutes: normalizeClassDurationMinutes(
          lesson.class_duration_minutes != null
            ? Number(lesson.class_duration_minutes)
            : null
        ),
        link_copy_count: Number(lesson.link_copy_count) || 0,
      };
    }),
    refs: data.refs ?? {},
    notes: data.notes ?? [],
    teachers: data.teachers,
  };
}
