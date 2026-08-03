/** 日语新课 → 抽问分片同步：前后端共享常量与类型（勿加 server-only） */

export const JP_LESSON_VOCAB_SYNC_CHUNK_SIZE = 8;

export type JpLessonVocabSyncPlan = {
  needed: true;
  total: number;
  offset: number;
  chunk_size: number;
};
