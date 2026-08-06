import type { EnVocabStatSortKey } from "@/lib/en-vocab-shared";
import type { EnVocabLevel } from "@/lib/types";
import { VOCAB_LEVELS } from "@/lib/vocab-page-shared";

export const EN_VOCAB_LEVELS: { key: EnVocabLevel; label: string }[] = VOCAB_LEVELS;

export const EN_VOCAB_STAT_SORT_COLUMNS: {
  key: EnVocabStatSortKey;
  label: string;
  labelLines?: [string, string];
  className: string;
}[] = [
  { key: "very", label: "非常熟悉", labelLines: ["非常", "熟悉"], className: "jp-vocab-stat-detail" },
  { key: "normal", label: "一般", className: "jp-vocab-stat-detail" },
  { key: "weak", label: "不熟悉", labelLines: ["不", "熟悉"], className: "jp-vocab-stat-detail" },
  { key: "total", label: "合计", className: "jp-vocab-stat-total" },
];

/** 单词表「备注」列 */
export const SHOW_REMARKS_COLUMN = true;

/** 暂时隐藏「随机高亮」按钮 */
export const SHOW_RANDOM_HIGHLIGHT = false;

/** 暂时隐藏「抽查排行」图表（功能保留，勿删组件） */
export const SHOW_RISK_CHART = false;

/** 默认今日抽查数量（管理员可改；跨日回到此值；见 en-vocab-teacher-visible.ts） */
export const EN_VOCAB_DAILY_QUIZ_TOP = 20;

/** 单词表默认每页条数（对齐日语抽问） */
export const EN_VOCAB_PAGE_SIZE = 20;

/** 单词表可选每页条数（对齐日语抽问） */
export const EN_VOCAB_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export const EN_VOCAB_PAGE_STORAGE_KEY = "en_vocab_current_page";
export const EN_VOCAB_PAGE_SIZE_STORAGE_KEY = "en_vocab_page_size";

/** 搜索关键词（刷新后保留；点「清除」才空） */
export const EN_VOCAB_SEARCH_QUERY_STORAGE_KEY = "en_vocab_search_query";
/** 类型筛选 all|word|grammar */
export const EN_VOCAB_SEARCH_KIND_STORAGE_KEY = "en_vocab_search_kind";
/** 最近搜索记录（JSON 字符串数组） */
export const EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY = "en_vocab_search_history";
/** 最近搜索最多条数 */
export const EN_VOCAB_SEARCH_HISTORY_MAX = 8;
/** 有关键词时强制拉最新词表的防抖（ms） */
export const EN_VOCAB_SEARCH_FRESH_DEBOUNCE_MS = 400;
