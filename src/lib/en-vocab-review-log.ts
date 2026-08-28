import type { EnVocabLevel } from "@/lib/types";

export type EnVocabReviewLogSource =
  | "flashcard_usage"
  | "table_level"
  | "peek_weak"
  | "share_weak";

export type EnVocabReviewLogEntry = {
  id: number;
  word_id: number;
  reviewed_at: string;
  reviewed_by: string;
  overall_level: EnVocabLevel;
  usage_levels: EnVocabLevel[] | null;
  usage_labels: string[] | null;
  usage_count: number;
  shared_to_study: boolean;
  source: EnVocabReviewLogSource;
};

export function enVocabLevelLabelZh(level: EnVocabLevel): string {
  if (level === "very") return "非常熟悉";
  if (level === "normal") return "一般";
  return "不熟悉";
}

export function enVocabReviewLogSourceLabelZh(
  source: EnVocabReviewLogSource
): string {
  switch (source) {
    case "flashcard_usage":
      return "抽查卡·按用法勾选";
    case "table_level":
      return "词表·整词勾选";
    case "peek_weak":
      return "学生查看·自动记不熟悉";
    case "share_weak":
      return "发给学生·自动记不熟悉";
    default:
      return source;
  }
}
