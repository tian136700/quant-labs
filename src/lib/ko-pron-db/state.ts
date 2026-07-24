import "server-only";

/** 模块级可变状态。拆文件后统一经此对象读写（禁止 export let）。 */
export const koPronDbState = {
  letterSchemaReady: false,
  catalogSchemaReady: false,
  settingSchemaReady: false,
  reviewDoneSchemaReady: false,
  catalogReady: false,
};

export const TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit";
export const TEACHER_QUIZ_LIVE_KEY = "teacher_quiz_live";
export const DAILY_DISPLAY_ORDER_KEY = "daily_display_order";
/** 一次性：建 catalog、清空旧抽问全量种子、重置日序/可见池 */
export const QUIZ_POOL_SPLIT_MIGRATION_KEY = "quiz_pool_split_v1";
/** 一次性：旧「元音/复合元音」→「单元音/双元音」（中间态；见 v2） */
export const VOWEL_CATEGORY_RENAME_MIGRATION_KEY = "vowel_category_rename_v1";
/** 一次性：教材用语「单元音/双元音」→「基本元音/复合元音」 */
export const VOWEL_CATEGORY_TEXTBOOK_MIGRATION_KEY = "vowel_category_textbook_v2";
