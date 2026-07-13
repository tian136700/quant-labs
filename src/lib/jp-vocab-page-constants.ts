import type { JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import type { JpVocabLevel } from "@/lib/types";
import { VOCAB_LEVELS } from "@/lib/vocab-page-shared";

export const JP_VOCAB_LEVELS: { key: JpVocabLevel; label: string }[] = VOCAB_LEVELS;

export const JP_VOCAB_STAT_SORT_COLUMNS: {
  key: JpVocabStatSortKey;
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

/** 暂时隐藏「抽查排行」图表 */
export const SHOW_RISK_CHART = false;

/** 单词表每页条数 */
export const JP_VOCAB_PAGE_SIZE = 20;

/** 操作列「发给学生」说明（表头短版 / 按钮下完整版） */
export const JP_VOCAB_SHARE_HINT_SHORT = "不熟悉时点「发给学生」";
export const JP_VOCAB_SHARE_HINT =
  "学生答不上来或不熟悉时，点此发送给他";

export const JP_VOCAB_PAGE_STORAGE_KEY = "jp_vocab_current_page";
