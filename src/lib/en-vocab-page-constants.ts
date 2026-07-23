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

/** 按当日序号，每日建议优先抽查的前 N 条（无服务端 visible pool 时的老师抽查池） */
export const EN_VOCAB_DAILY_QUIZ_TOP = 20;

/** 单词表默认每页条数 */
export const EN_VOCAB_PAGE_SIZE = 100;

export const EN_VOCAB_PAGE_STORAGE_KEY = "en_vocab_current_page";
