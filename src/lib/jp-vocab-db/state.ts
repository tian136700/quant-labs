import "server-only";

import type {
  JpVocabLevel,
  JpVocabRef,
  JpVocabShareRequest,
  JpVocabSharedItem,
  JpVocabWord,
} from "@/lib/types";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import { JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT } from "@/lib/jp-vocab-quiz-score";
import {
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import { JP_VOCAB_DAILY_QUIZ_TOP } from "@/lib/jp-vocab-daily-quiz-progress";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabQuizPriorityBoost } from "@/lib/jp-vocab-quiz-priority-boost";
import {
  JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  type JpVocabTeacherQuizLive,
} from "@/lib/jp-vocab-teacher-quiz-live";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/** 模块级可变状态（dev store + 短缓存）。拆文件后统一经此对象读写。 */
export const jpVocabDbState = {
  devStoreEnabled: false,
  devWords: [] as JpVocabWord[],
  devRefs: new Map<string, JpVocabRef>(),
  devNextId: 1,
  devSeeded: false,
  vocabWordSchemaReady: false,
  devDailyQuizStyle: { ...JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } as JpVocabDailyQuizStyle,
  devTeacherVisibleLimit: {
    date: "",
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
    released_today: false,
    release_count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    excluded_batch_ids: [],
  } as JpVocabTeacherVisibleLimit,
  devDailyDisplayOrder: {
    date: "",
    ids: [],
    round_checked_ids: [],
  } as JpVocabDailyDisplayOrder,
  devQuizPriorityBoost: null as JpVocabQuizPriorityBoost | null,
  devQuizTimeWeight: JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  devTeacherQuizLive: {
    ...JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
    date: beijingDateString(),
  } as JpVocabTeacherQuizLive,
  devReviewDoneWordIds: [] as number[],
  devShared: [] as Array<{
    id: number;
    word_id: number;
    shared_by: string;
    shared_at: string;
    share_date: string;
    auto_marked_level: JpVocabLevel | null;
  }>,
  devSharedNextId: 1,
  jpVocabSharedSchemaReady: false,
  jpVocabSharedColumnsReady: false,
  devShareRequests: [] as JpVocabShareRequest[],
  devShareRequestNextId: 1,
  jpVocabShareRequestSchemaReady: false,
  jpVocabSettingSchemaReady: false,
  jpVocabReviewDoneSchemaReady: false,
  teacherQuizLiveReadCache: null as {
    at: number;
    value: JpVocabTeacherQuizLive;
  } | null,
  teacherVisibleLimitReadCache: null as {
    at: number;
    value: JpVocabTeacherVisibleLimit;
  } | null,
  sharedTodayListCache: null as {
    at: number;
    date: string;
    value: { items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> };
  } | null,
  sharedTodayListCacheGen: 0,
  sharedTodayListInflight: null as Promise<{
    items: JpVocabSharedItem[];
    refs: Record<string, JpVocabRef>;
  }> | null,
};

export function invalidateJpVocabSharedTodayCache() {
  jpVocabDbState.sharedTodayListCache = null;
  jpVocabDbState.sharedTodayListCacheGen += 1;
}

export function enableJpVocabDevStore() {
  jpVocabDbState.devStoreEnabled = true;
}

export const JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS = 10_000;
export const JP_VOCAB_DAILY_QUIZ_STYLE_KEY = "daily_quiz_style";
export const JP_VOCAB_DAILY_DISPLAY_ORDER_KEY = "daily_display_order";
export const JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY = "quiz_priority_boost";
export const JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit";
export const JP_VOCAB_TEACHER_QUIZ_LIVE_KEY = "teacher_quiz_live";
export const JP_VOCAB_SETTING_READ_CACHE_MS = 5_000;
export const JP_VOCAB_SHARED_LIST_CACHE_MS = 5_000;
