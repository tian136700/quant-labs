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
import {
  normalizeJpVocabTeacherVisibleLimit,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { normalizeClassDurationMinutes } from "@/lib/jp-lesson-shared";
import { normalizeJpLessonTeacher } from "@/lib/jp-lesson-teacher-rate";

export const JP_VOCAB_CACHE_KEY = "jp-api:vocab:v5";
export const JP_LESSON_CACHE_KEY = "jp-api:lesson:v10";

/** 词表本地缓存有效期内不重复 GET（多人同时刷新时减轻 Worker 压力） */
export const JP_VOCAB_REFRESH_TTL_MS = 45_000;

/** 新课列表本地缓存 TTL，与词表一致 */
export const JP_LESSON_REFRESH_TTL_MS = 45_000;

export type JpVocabApiPayload = {
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  daily_quiz_style: JpVocabDailyQuizStyle;
  display_order: JpVocabDailyDisplayOrder;
  /** 今日已共享到「今日背单词」的 word_id 列表（北京时间 0 点清空） */
  shared_today_word_ids: number[];
  /** 非管理员老师可见的当日序号上限（默认 20，跨日重置） */
  teacher_visible_limit: JpVocabTeacherVisibleLimit;
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
    shared_today_word_ids?: number[];
    teacher_visible_limit?: Partial<JpVocabTeacherVisibleLimit>;
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
    shared_today_word_ids: Array.isArray(data.shared_today_word_ids)
      ? data.shared_today_word_ids.map((id) => Number(id)).filter((id) => id > 0)
      : [],
    teacher_visible_limit: normalizeJpVocabTeacherVisibleLimit(
      data.teacher_visible_limit
    ),
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
        meanings:
          lesson.meanings != null && String(lesson.meanings).trim()
            ? String(lesson.meanings).trim()
            : null,
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
    teachers: Array.isArray(data.teachers)
      ? data.teachers.map((teacher) => normalizeJpLessonTeacher(teacher))
      : data.teachers,
  };
}
