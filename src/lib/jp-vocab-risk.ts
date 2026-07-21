import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScore,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import { jpVocabRiskIndex, jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabKind, JpVocabWord } from "@/lib/types";

export type JpVocabRiskRow = {
  id: number;
  name: string;
  kind: JpVocabKind;
  kindLabel: string;
  /** 与日序一致：final_score（含久未复习抬升） */
  risk: number;
  /** 仅三项计数算出的基础 priority（不含时间抬升） */
  basePriority: number;
  familiar: number;
  normal: number;
  unknown: number;
  reviewCount: number;
};

/** 基础 priority = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function calcJpVocabRisk(
  familiar: number,
  normal: number,
  unknown: number
): number {
  const raw = normal * 1 + unknown * 2 - familiar * 0.3;
  return Math.round(raw * 10) / 10;
}

export function jpVocabKindLabel(kind: JpVocabKind): string {
  return kind === "grammar" ? "语法" : "单词";
}

/** 低风险绿 / 中风险黄 / 高风险红（按 final_score） */
export function jpVocabRiskColor(risk: number): string {
  if (risk >= 3) return "var(--rise)";
  if (risk >= 1) return "#d4a017";
  return "var(--fall)";
}

export function buildRiskData(
  words: JpVocabWord[],
  opts?: { timeWeight?: number; now?: Date }
): JpVocabRiskRow[] {
  const timeWeight = normalizeJpVocabQuizTimeWeight(
    opts?.timeWeight ?? JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
  );
  const now = opts?.now ?? new Date();
  return words
    .map((w) => {
      const familiar = w.cnt_very;
      const normal = w.cnt_normal;
      const unknown = w.cnt_weak;
      return {
        id: w.id,
        name: w.word,
        kind: w.kind,
        kindLabel: jpVocabKindLabel(w.kind),
        risk: jpVocabFinalQuizScore(w, timeWeight, now),
        basePriority: jpVocabRiskIndex(w),
        familiar,
        normal,
        unknown,
        reviewCount: jpVocabTotalReviews(w),
      };
    })
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name, "ja"));
}

/** 图表用：最终抽问得分降序；仅展示 score > 0 */
export function buildRiskChartData(
  words: JpVocabWord[],
  opts?: { timeWeight?: number; now?: Date }
): JpVocabRiskRow[] {
  return buildRiskData(words, opts).filter((row) => row.risk > 0);
}

/** 未列入排行的条数（final_score ≤ 0） */
export function countExcludedRiskRows(
  words: JpVocabWord[],
  opts?: { timeWeight?: number; now?: Date }
): number {
  return buildRiskData(words, opts).filter((row) => row.risk <= 0).length;
}
