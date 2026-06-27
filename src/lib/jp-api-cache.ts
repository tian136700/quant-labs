import type { JpLessonNote, JpLessonRecord, JpLessonTeacher, JpVocabRef, JpVocabWord } from "@/lib/types";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";

export const JP_VOCAB_CACHE_KEY = "jp-api:vocab:v2";
export const JP_LESSON_CACHE_KEY = "jp-api:lesson:v4";

export type JpVocabApiPayload = {
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  daily_quiz_style: JpVocabDailyQuizStyle;
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
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.words)) {
    throw new Error(data.error || "加载失败");
  }
  return {
    words: data.words.map((word) => ({
      ...word,
      today_check_count: word.today_check_count ?? 0,
    })),
    refs: data.refs ?? {},
    daily_quiz_style: normalizeJpVocabDailyQuizStyle(
      data.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT
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
        learning: Boolean(lesson.learning),
        teacher_ids: teacherIds,
      };
    }),
    refs: data.refs ?? {},
    notes: data.notes ?? [],
    teachers: data.teachers,
  };
}
