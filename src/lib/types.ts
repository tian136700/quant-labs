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
  /** 日语复习 PDF / 单词列表 / 假名补全：Mac 脚本与 API 上传共用 Bearer Token（wrangler secret） */
  JP_REVIEW_UPLOAD_TOKEN?: string;
  /** 日语复习 PDF：下载可选 query key（留空则公开下载） */
  JP_REVIEW_DOWNLOAD_KEY?: string;
  /** Bark：上课提醒推送到 iPhone（wrangler secret，勿提交） */
  BARK_DEVICE_KEY?: string;
  /** Bark 服务端（可选，默认 https://api.day.app） */
  BARK_SERVER?: string;
  /** 上课提醒自定义图标 URL（可选） */
  BARK_ICON_CLASS_REMIND?: string;
  /** 开课前提醒档位，默认 10,5,1 */
  SCHEDULE_CLASS_BARK_LEAD_MINUTES?: string;
  /** 英语单词模块：老师用户名 */
  ETR_EN_VOCAB_USERNAME?: string;
  /** 英语单词模块：老师密码（仅环境变量/Secret，勿提交 Git） */
  ETR_EN_VOCAB_PASSWORD?: string;
  /** 管理员手动补例句：tokken Anthropic（仅 Secret；定时任务仍走 Mac） */
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
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
  /** 区县（ip9 area；归属地回填写入） */
  geo_area?: string | null;
  /** 运营商（ip9 isp；归属地回填写入） */
  geo_isp?: string | null;
  /** 访问时已登录的用户名；未登录为 null */
  username?: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
  created_at: string;
  /** 记录内容最后刷新时间（如归属地回填）；缺省等同 created_at */
  updated_at?: string | null;
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
  /** 列表/轮询接口可能省略 class_notes 正文，仅返回是否有备注 */
  class_notes_present?: boolean;
  /** 巧记 / 联想记忆（仅管理员可见与编辑） */
  mnemonic?: string | null;
  /**
   * 标注：口语常用 / 考试常用 / 口语考试都常用。
   * 上传或新课同步写入；卡片在备注下方展示。
   */
  annotation?: string | null;
  /**
   * 教材课次 / 课数（如「标日初级上册第23课」）。
   * 新课 `course_label` 标已完成时同步；卡片在备注（与标注）下方展示；旧数据可空。
   */
  course_label?: string | null;
  /**
   * 口语出现频率 1～10（词级；对齐英语用法出现频次打分）。
   * AI 补释义/用法时顺带写入；旧数据可空。
   */
  oral_frequency?: number | null;
  /**
   * 考试出现频率 1～10（词级；JLPT / 校内考试等场景）。
   * AI 补释义/用法时顺带写入；旧数据可空。
   */
  exam_frequency?: number | null;
  /**
   * 常用用法编号列表。
   * 英语：考点用法，存库形如 `1. [8] 中文说明`（`[8]`=出现频次 1～10，卡片展示「出现频次 8」）；
   * 日语语法：N5～N2 常用用法（驱动 1:1 例句）；日语单词一般不用。
   */
  usage?: string | null;
  /** 用法来源（如：手动、本地 gemma4:26b、线上 claude-…） */
  usage_source?: string | null;
  /**
   * 接序（接续形态）：动词哪一形、一类/二类形容词、名词等如何接该语法；
   * 单词则为词类与常用活用。与用法/例句同次补全；用法正文不含接序。
   */
  connection?: string | null;
  /** 接序来源（如：手动、线上 claude-…） */
  connection_source?: string | null;
  /** 例句（课堂带读展示；日语抽问列表不显示，编辑时可填） */
  example_sentences?: string | null;
  /** 例句来源（如：手动、DeepSeek、本地模型名；老师可见，便于纠错与质量对比） */
  example_sentences_source?: string | null;
  /**
   * 相关构词：含本词汉字/读音的简单词（口→入口），助记用。
   * 多行「漢字(かな)：中文」；仅单词；连浊算同一读音族。
   */
  related_compounds?: string | null;
  /** 相关构词来源（手动 / Claude / Agent现写…） */
  related_compounds_source?: string | null;
  /** 释义来源（如：手动、DeepSeek、Qwen本地） */
  meaning_source?: string | null;
  /** 词性来源（如：手动、线上 claude-…） */
  pos_source?: string | null;
  /** 读音/音标来源（英语 IPA；日语读音亦可复用） */
  reading_source?: string | null;
  /** 最近一次勾选熟悉程度（用于今日内改选修正） */
  last_review_level?: JpVocabLevel | null;
  last_review_at?: string | null;
  /**
   * 间隔重复：当前间隔（天）。勾选熟悉程度后写入；日序已抽查桶按到期排。
   * 非常熟悉阶梯 10→20→30→…；不熟悉=1；一般约×1.2。
   */
  srs_interval_days?: number;
  /** 间隔重复：下次应抽查的北京日期 YYYY-MM-DD；空=旧数据（日序当已到期） */
  srs_due_date?: string | null;
  /**
   * 英语抽查卡：最近一次按用法勾选的熟悉程度 JSON 数组（如 `["very","normal"]`）。
   * 总体熟悉程度仍写在 last_review_level / cnt_*。
   */
  last_usage_levels?: string | null;
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
  example_sentences?: string | null;
  /** 口语常用 / 考试常用 / 口语考试都常用 */
  annotation?: string | null;
};

/** 学生请求老师发送当前抽查单词（按 request_date 每日清空） */
export interface JpVocabShareRequest {
  id: number;
  requested_by: string;
  requested_at: string;
  request_date: string;
  dismissed_at: string | null;
  dismissed_by: string | null;
}

/** 老师共享给学生「今日背单词」的单条记录（按 share_date 每日清空） */
export interface JpVocabSharedItem {
  id: number;
  word_id: number;
  shared_by: string;
  shared_at: string;
  share_date: string;
  /** 老师今日勾选的熟悉程度；老师尚未勾选时为 undefined */
  level?: JpVocabLevel;
  word: JpVocabWord;
}

export type JpVocabRefUploadInput = {
  ref_key: string;
  title?: string | null;
  media_type?: JpVocabMediaType | null;
};

/** word / grammar 单类型；word_grammar = 同一课同时含单词+语法（日语新课「单词加语法」） */
export type JpLessonKind = "word" | "grammar" | "word_grammar";

export interface JpLessonTeacherLinkedUser {
  id: number;
  username: string;
}

export interface JpLessonTeacher {
  id: number;
  name: string;
  /** 每小时课时费（元）；可为空 */
  hourly_rate: number | null;
  /** 单次课时长（分钟：20 / 30 / 45 / 55 / 60）；可为空 */
  lesson_minutes: number | null;
  /**
   * 腾讯会议号（固定；目前主要用于英语老师）。
   * 日语/韩语列表可不返回该字段。
   */
  tencent_meeting_id?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** 已关联新课数量（jp_lesson_teacher_link 条数）；用于设置老师时按频次排序 */
  lesson_count?: number;
  /** 后台老师列表：已关联的登录账号 */
  linked_user?: JpLessonTeacherLinkedUser | null;
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
  /** 与 content 各项一一对应的释义，库内用 | 分隔 */
  meanings: string | null;
  /**
   * 与 content 各项一一对应的标注（口语常用 / 考试常用 / 口语考试都常用），库内用 | 分隔
   */
  annotations: string | null;
  /**
   * 与 content 各项一一对应的例句，库内用 ||| 分隔；
   * 单项内为「日语 + 译文：」多行，最多 10 条例句
   */
  example_sentences: string | null;
  /**
   * 仅历史 kind=word_grammar：content 末尾连续多少项是语法（前面为单词）。
   * 新合传改为两条 word/grammar + course_*；此项为 0。
   */
  grammar_item_count: number;
  /**
   * 同一课教材名（合传上传写入，如「标日23课」）；旧数据 / 单传为空。
   * 列表「教材」列展示此文案。
   */
  course_label: string | null;
  /**
   * 同一课关联 ID（一次 upload-mixed 生成的单词条与语法条共享）。
   */
  course_group_id: string | null;
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
  /** 教案链接复制次数 */
  link_copy_count: number;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export type JpLessonUploadInput = {
  kind: JpLessonKind;
  content: string;
  /** 与 content 各项一一对应，多项用 | 分隔（释义内可含逗号） */
  meanings?: string | null;
  /**
   * 与 content 各项一一对应的标注，多项用 | 分隔；
   * 每项为：口语常用 / 考试常用 / 口语考试都常用
   */
  annotations?: string | null;
  /**
   * 与 content 各项一一对应的例句，多项用 ||| 分隔；
   * 单项内换行写「日语 / 译文：」，可选，每词最多 10 条
   */
  example_sentences?: string | null;
  /** 历史字段；新合传勿用 */
  grammar_item_count?: number | null;
  /** 同一课教材名；单传一般为空，合传由 upload-mixed 写入 */
  course_label?: string | null;
  /** 同一课关联 ID；合传由服务端生成 */
  course_group_id?: string | null;
  title?: string | null;
  ref_key?: string | null;
};

/**
 * 日语新课合传：一次上传 → 两条课（word + grammar），共享 course_label / course_group_id。
 * 列表仍分开展示类型「单词」「语法」，「教材」列显示如「标日23课」。
 */
export type JpLessonMixedUploadInput = {
  /** 必填。同一课教材名，如「标日23课」 */
  course_label: string;
  word_content: string;
  word_meanings?: string | null;
  word_annotations?: string | null;
  word_example_sentences?: string | null;
  grammar_content: string;
  grammar_meanings?: string | null;
  grammar_annotations?: string | null;
  grammar_example_sentences?: string | null;
  /** 可选；写入两侧 title，默认同 course_label */
  title?: string | null;
  word_ref_key?: string | null;
  grammar_ref_key?: string | null;
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

/** 英语单词/新课：与日语模块结构相同，独立表存储；另有分类标签 category */
export type EnVocabLevel = JpVocabLevel;
export type EnVocabKind = JpVocabKind;
export type EnVocabMediaType = JpVocabMediaType;
export type EnVocabRef = JpVocabRef;
/** 英语词条：在日语字段基础上增加分类标签（如「雅思托福」） */
export interface EnVocabWord extends JpVocabWord {
  /** 分类标签；缺省按「雅思托福」 */
  category: string | null;
  /**
   * 上传类型码：`en_lesson` | `api` | `manual`
   * 展示见 displayEnVocabUploadSource（由英语新课模块同步 / 通过API接口上传 / 手动添加）
   */
  upload_source: string | null;
}
export type EnVocabUploadInput = JpVocabUploadInput & {
  /** 分类标签；缺省「雅思托福」；可传 IELTS/TOEFL 等别名 */
  category?: string | null;
  /** 上传类型；本地 API 上传默认 api，可不传 */
  upload_source?: string | null;
};
export type EnVocabSharedItem = Omit<JpVocabSharedItem, "word"> & {
  word: EnVocabWord;
};
export type EnVocabRefUploadInput = JpVocabRefUploadInput;
/** 英语新课仅 word|grammar（无日语合传 word_grammar） */
export type EnLessonKind = "word" | "grammar";
export type EnLessonTeacher = JpLessonTeacher;
export type EnLessonTeacherReviewRecord = JpLessonTeacherReviewRecord;
export type EnLessonTeacherReviewSortField = JpLessonTeacherReviewSortField;
export type EnLessonTeacherReviewSummary = JpLessonTeacherReviewSummary;
export type KoLessonTeacher = JpLessonTeacher;
export type KoLessonTeacherReviewRecord = JpLessonTeacherReviewRecord;
export type KoLessonTeacherReviewSortField = JpLessonTeacherReviewSortField;
export type KoLessonTeacherReviewSummary = JpLessonTeacherReviewSummary;
export type EnLessonClassSchedule = JpLessonClassSchedule;
export type EnLessonClassScheduleInput = JpLessonClassScheduleInput;
/** 英语新课：带分类标签，完成时同步到 en_vocab_word.category */
export interface EnLessonRecord extends Omit<JpLessonRecord, "kind"> {
  kind: EnLessonKind;
  /** 分类标签；缺省「雅思托福」 */
  category: string | null;
  /** 课次备注（如语法说明）；可空 */
  remarks: string | null;
}
export type EnLessonUploadInput = Omit<JpLessonUploadInput, "kind"> & {
  kind: EnLessonKind;
  /** 分类标签；缺省「雅思托福」 */
  category?: string | null;
  /** 课次备注（如语法说明） */
  remarks?: string | null;
};
export type EnLessonNote = JpLessonNote;

/** 韩语发音：熟悉程度（抽问卡勾选） */
export type KoPronLevel = "very" | "normal" | "weak";

/** 韩语发音勾选总库（约 40 字母） */
export interface KoPronCatalogLetter {
  id: number;
  letter: string;
  reading: string | null;
  meaning: string | null;
  /** 辅音 / 双辅音 / 基本元音 / 复合元音（教材用语） */
  category: string | null;
  /** 已勾选进抽问池的时间；NULL=未勾选 */
  selected_at: string | null;
  /** 已勾选进复习池的时间；NULL=未入复习；与抽问池独立 */
  review_selected_at: string | null;
  /** 发音复习：熟悉次数（终身；清除本轮进度不清） */
  review_cnt_familiar: number;
  /** 发音复习：不熟悉次数（终身） */
  review_cnt_unfamiliar: number;
  /** 发音复习总次数 = 熟悉 + 不熟悉（点熟悉/不熟悉时 +1；清除本轮进度不清零） */
  review_count: number;
  /** 今日发音复习次数（北京日；跨日归零显示） */
  today_review_count: number;
  /** 今日复习次数对应的北京日期 YYYY-MM-DD */
  today_review_date: string | null;
  created_at: string;
  updated_at: string;
}

/** 韩语发音抽问池（仅已勾选字母） */
export interface KoPronLetter {
  id: number;
  letter: string;
  reading: string | null;
  meaning: string | null;
  /** 辅音 / 双辅音 / 基本元音 / 复合元音（教材用语） */
  category: string | null;
  cnt_very: number;
  cnt_normal: number;
  cnt_weak: number;
  today_check_count: number;
  today_check_date?: string | null;
  last_review_level?: KoPronLevel | null;
  last_review_at?: string | null;
  created_at: string;
  updated_at: string;
}

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
