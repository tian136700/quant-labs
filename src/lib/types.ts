export interface BarRow {
  bar_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  rsi?: number | null;
}

export interface BarsApiResponse {
  ok: boolean;
  error?: string;
  symbol?: string;
  name?: string;
  rsi_period?: number;
  start?: string;
  end?: string;
  years?: number;
  cache_hit?: boolean;
  rows?: BarRow[];
}

export interface StrategyResult {
  key: string;
  name: string;
  rule: string;
  buy_days: number;
  shares: number;
  total_cost: number;
  avg_cost: number | null;
  per_pct: number | null;
  delta_pct: number | null;
  total_pnl: number | null;
}

export interface ComparePayload {
  symbol: string;
  start: string;
  end: string;
  years: number;
  current_date: string;
  current_price: number;
  rsi_period: number;
  strategies: StrategyResult[];
  chart_points: ChartPoint[];
}

/** 图表可选 RSI 阈值（默认 30） */
export const CHART_RSI_THRESHOLDS = [15, 20, 25, 30] as const;
export type ChartRsiThreshold = (typeof CHART_RSI_THRESHOLDS)[number];

export interface ChartPoint {
  date: string;
  dca_value: number;
  rsi_15_value: number;
  rsi_20_value: number;
  rsi_25_value: number;
  rsi_30_value: number;
}

export interface CloudflareEnv {
  DB: D1Database;
  JP_REVIEW?: R2Bucket;
  RSI_PERIOD?: string;
  PRICE_DECIMAL_PLACES?: string;
  /** 英语老师评价：管理员用户名（可公开，默认 Admin） */
  ETR_ADMIN_USERNAME?: string;
  /** 英语老师评价：管理员初始密码（仅环境变量/Secret，勿提交 Git） */
  ETR_ADMIN_PASSWORD?: string;
  /** 日语单词模块：老师用户名（默认 LiLaoshi） */
  ETR_JP_VOCAB_USERNAME?: string;
  /** 日语单词模块：老师密码（仅环境变量/Secret，勿提交 Git） */
  ETR_JP_VOCAB_PASSWORD?: string;
  /** 日语单词模块：user1 用户名（默认 user1） */
  ETR_JP_VOCAB_USER1_USERNAME?: string;
  /** 日语单词模块：user1 密码（仅环境变量/Secret，至少 10 位，勿提交 Git） */
  ETR_JP_VOCAB_USER1_PASSWORD?: string;
  /** 日语复习 PDF / 单词列表：Mac 脚本与 API 上传共用 Bearer Token（wrangler secret） */
  JP_REVIEW_UPLOAD_TOKEN?: string;
  /** 日语复习 PDF：下载可选 query key（留空则公开下载） */
  JP_REVIEW_DOWNLOAD_KEY?: string;
  /** 英语单词模块：老师用户名 */
  ETR_EN_VOCAB_USERNAME?: string;
  /** 英语单词模块：老师密码（仅环境变量/Secret，勿提交 Git） */
  ETR_EN_VOCAB_PASSWORD?: string;
}

export interface EnglishTeacherReviewRecord {
  id: number;
  teacher_name: string;
  class_date: string;
  score: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export type EnglishTeacherReviewSortField =
  | "teacher_name"
  | "class_date"
  | "score"
  | "updated_at";

export interface UserFeedbackRecord {
  id: number;
  email: string;
  content: string;
  ip: string;
  country_code: string | null;
  geo_region?: string | null;
  geo_region_code?: string | null;
  geo_city?: string | null;
  url_path: string | null;
  locale: string | null;
  created_at: string;
}

export interface VisitLogRecord {
  id: number;
  ip: string;
  country_code: string | null;
  geo_region?: string | null;
  geo_region_code?: string | null;
  geo_city?: string | null;
  /** 访问时已登录的用户名；未登录为 null */
  username?: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
  created_at: string;
  /** 该 IP 自首次访问以来的累计记录数（查询时计算） */
  ip_visit_count?: number;
}

export type JpVocabLevel = "very" | "normal" | "weak";
export type JpVocabKind = "word" | "grammar";
export type JpVocabMediaType = "image" | "pdf";

export interface JpVocabRef {
  ref_key: string;
  title: string | null;
  media_type: JpVocabMediaType;
  r2_key: string;
  created_at: string;
  updated_at: string;
}

export interface JpVocabWord {
  id: number;
  word: string;
  reading: string | null;
  meaning: string | null;
  /** 词性，如：名词、动词、形容词 */
  pos: string | null;
  kind: JpVocabKind;
  ref_key: string | null;
  cnt_very: number;
  cnt_normal: number;
  cnt_weak: number;
  /** 今日抽查次数（北京时间 0 点归零） */
  today_check_count: number;
  /** 今日抽查次数对应的北京时间日期 YYYY-MM-DD（服务端持久化用） */
  today_check_date?: string | null;
  /** 来自日语新课的课堂笔记（标记完成时同步） */
  class_notes: string | null;
  /** 最近一次勾选熟悉程度（用于今日内改选修正） */
  last_review_level?: JpVocabLevel | null;
  last_review_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type JpVocabUploadInput = {
  word: string;
  reading?: string | null;
  meaning?: string | null;
  kind?: JpVocabKind | null;
  ref_key?: string | null;
  class_notes?: string | null;
};

/** 老师共享给学生「今日背单词」的单条记录（按 share_date 每日清空） */
export interface JpVocabSharedItem {
  id: number;
  word_id: number;
  shared_by: string;
  shared_at: string;
  share_date: string;
  /** 共享时自动标记为不熟悉 */
  level: JpVocabLevel;
  word: JpVocabWord;
}

export type JpVocabRefUploadInput = {
  ref_key: string;
  title?: string | null;
  media_type?: JpVocabMediaType | null;
};

export type JpLessonKind = "word" | "grammar";

export interface JpLessonTeacher {
  id: number;
  name: string;
  /** 每小时课时费（元）；可为空 */
  hourly_rate: number | null;
  /** 单次课时长（分钟：20 / 30 / 45 / 55 / 60）；可为空 */
  lesson_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JpLessonTeacherReviewRecord {
  id: number;
  teacher_id: number;
  class_date: string;
  score: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export type JpLessonTeacherReviewSortField = "class_date" | "score" | "updated_at";

export interface JpLessonTeacherReviewSummary {
  teacher_id: number;
  review_count: number;
  avg_score: number | null;
  /** 最近一次评价的备注 */
  latest_remark: string | null;
  /** 最近一次评价的上课日期 */
  latest_class_date: string | null;
}

/** 管理员复制登录链接时可选附带的文字模板 */
export interface LoginLinkTemplate {
  id: number;
  name: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JpLessonClassSchedule {
  id: number;
  /** 上课时间（北京时间 YYYY-MM-DD HH:mm:ss） */
  class_at: string;
  /** 上课时长（分钟：20 / 30 / 45 / 55 / 60） */
  duration_minutes: number | null;
}

export type JpLessonClassScheduleInput = {
  class_at: string;
  duration_minutes: number | null;
};

export interface JpLessonRecord {
  id: number;
  kind: JpLessonKind;
  content: string;
  title: string | null;
  ref_key: string | null;
  completed: boolean;
  /** 学习中：与未完成一样不同步到单词复习 */
  learning: boolean;
  /** 最近一次切换学习状态的时间；未操作过则为 null */
  status_updated_at: string | null;
  /** 最近一次切换学习状态的操作人用户名；未操作过则为 null */
  status_updated_by: string | null;
  /** 上课老师 ID 列表；仅管理员可见与编辑 */
  teacher_ids: number[];
  /** 未维护在系统中的其他上课老师姓名；仅管理员可见与编辑 */
  teacher_other: string | null;
  /** 预约上课时间列表（北京时间；仅管理员可见与编辑） */
  class_schedules: JpLessonClassSchedule[];
  /** @deprecated 兼容旧字段，等于 class_schedules[0] */
  next_class_at: string | null;
  /** @deprecated 兼容旧字段，等于 class_schedules[0]?.duration_minutes */
  class_duration_minutes: number | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export type JpLessonUploadInput = {
  kind: JpLessonKind;
  content: string;
  title?: string | null;
  ref_key?: string | null;
};

export interface JpLessonNote {
  id: number;
  lesson_id: number;
  /** content 拆分后的单个单词/语法 */
  item_word: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 英语单词/新课：与日语模块结构相同，独立表存储 */
export type EnVocabLevel = JpVocabLevel;
export type EnVocabKind = JpVocabKind;
export type EnVocabMediaType = JpVocabMediaType;
export type EnVocabRef = JpVocabRef;
export type EnVocabWord = JpVocabWord;
export type EnVocabUploadInput = JpVocabUploadInput;
export type EnVocabSharedItem = JpVocabSharedItem;
export type EnVocabRefUploadInput = JpVocabRefUploadInput;
export type EnLessonKind = JpLessonKind;
export type EnLessonTeacher = JpLessonTeacher;
export type EnLessonTeacherReviewRecord = JpLessonTeacherReviewRecord;
export type EnLessonTeacherReviewSortField = JpLessonTeacherReviewSortField;
export type EnLessonTeacherReviewSummary = JpLessonTeacherReviewSummary;
export type EnLessonClassSchedule = JpLessonClassSchedule;
export type EnLessonClassScheduleInput = JpLessonClassScheduleInput;
export type EnLessonRecord = JpLessonRecord;
export type EnLessonUploadInput = JpLessonUploadInput;
export type EnLessonNote = JpLessonNote;

export interface TrendFetchRunRecord {
  id: number;
  fetched_at: string;
  github_count: number;
  reddit_count: number;
  combined_count: number;
  selected_count: number;
  created_at: string;
}

export interface TrendItemRecord {
  id: number;
  run_id: number;
  source: string;
  external_id: string;
  title: string;
  description: string | null;
  url: string | null;
  stars: number | null;
  language: string | null;
  subreddit: string | null;
  topics_json: string | null;
  published_at: string | null;
  heat_score: number;
  selected: number;
  selection_rank: number | null;
  system_prompt: string | null;
  user_prompt: string | null;
  full_prompt: string | null;
  created_at: string;
}
