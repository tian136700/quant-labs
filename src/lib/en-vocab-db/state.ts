import "server-only";

import type {
  EnVocabLevel,
  EnVocabRef,
  EnVocabSharedItem,
  EnVocabWord,
} from "@/lib/types";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  EN_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  type EnVocabTeacherQuizLive,
} from "@/lib/en-vocab-teacher-quiz-live";
import {
  defaultEnVocabTeacherVisibleLimit,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import { beijingDateString } from "@/lib/en-vocab-daily-check";

/** 模块级可变状态（dev store + 短缓存）。拆文件后统一经此对象读写。 */
export const enVocabDbState = {
  devStoreEnabled: false,
  devWords: [] as EnVocabWord[],
  devRefs: new Map<string, EnVocabRef>(),
  devNextId: 1,
  devSeeded: false,
  vocabWordSchemaReady: false,
  vocabWordSchemaVersion: 0,
  devDailyQuizStyle: { ...JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } as EnVocabDailyQuizStyle,
  devDailyDisplayOrder: {
    date: "",
    ids: [],
    round_checked_ids: [],
  } as EnVocabDailyDisplayOrder,
  devShared: [] as Array<{
    id: number;
    word_id: number;
    shared_by: string;
    shared_at: string;
    share_date: string;
  }>,
  devSharedNextId: 1,
  enVocabSharedSchemaReady: false,
  devTeacherQuizLive: {
    ...EN_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
    date: beijingDateString(),
  } as EnVocabTeacherQuizLive,
  devTeacherVisibleLimit: defaultEnVocabTeacherVisibleLimit() as EnVocabTeacherVisibleLimit,
  teacherVisibleLimitReadCache: null as {
    at: number;
    value: EnVocabTeacherVisibleLimit;
  } | null,
  sharedTodayListCache: null as {
    at: number;
    date: string;
    value: { items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> };
  } | null,
  sharedTodayListCacheGen: 0,
  sharedTodayListInflight: null as Promise<{
    items: EnVocabSharedItem[];
    refs: Record<string, EnVocabRef>;
  }> | null,
  teacherQuizLiveReadCache: null as {
    at: number;
    value: EnVocabTeacherQuizLive;
  } | null,
  devReviewDoneWordIds: [] as number[],
  enVocabReviewDoneSchemaReady: false,
};

/** v5: en_vocab_word.connection / connection_source（语法接续表，对齐日语 id=521） */
export const EN_VOCAB_WORD_SCHEMA_VERSION = 5;
export const EN_VOCAB_SHARED_LIST_CACHE_MS = 5_000;
export const EN_VOCAB_SETTING_READ_CACHE_MS = 5_000;
export const EN_VOCAB_TEACHER_QUIZ_LIVE_KEY = "teacher_quiz_live";
export const JP_VOCAB_DAILY_QUIZ_STYLE_KEY = "daily_quiz_style";
export const JP_VOCAB_DAILY_DISPLAY_ORDER_KEY = "daily_display_order";
export const EN_VOCAB_TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit";

export function invalidateEnVocabSharedTodayCache() {
  enVocabDbState.sharedTodayListCache = null;
  enVocabDbState.sharedTodayListCacheGen += 1;
}

export function enableEnVocabDevStore() {
  enVocabDbState.devStoreEnabled = true;
}
