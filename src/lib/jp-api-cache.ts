import type { JpLessonNote, JpLessonRecord, JpVocabRef, JpVocabWord } from "@/lib/types";

export const JP_VOCAB_CACHE_KEY = "jp-api:vocab:v1";
export const JP_LESSON_CACHE_KEY = "jp-api:lesson:v2";

export type JpVocabApiPayload = {
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
};

export type JpLessonApiPayload = {
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  notes: JpLessonNote[];
};

export function parseJpVocabApi(json: unknown): JpVocabApiPayload {
  const data = json as {
    ok?: boolean;
    words?: JpVocabWord[];
    refs?: Record<string, JpVocabRef>;
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.words)) {
    throw new Error(data.error || "加载失败");
  }
  return { words: data.words, refs: data.refs ?? {} };
}

export function parseJpLessonApi(json: unknown): JpLessonApiPayload {
  const data = json as {
    ok?: boolean;
    lessons?: JpLessonRecord[];
    refs?: Record<string, JpVocabRef>;
    notes?: JpLessonNote[];
    error?: string;
  };
  if (!data.ok || !Array.isArray(data.lessons)) {
    throw new Error(data.error || "加载失败");
  }
  return {
    lessons: data.lessons.map((lesson) => ({
      ...lesson,
      learning: Boolean(lesson.learning),
    })),
    refs: data.refs ?? {},
    notes: data.notes ?? [],
  };
}
