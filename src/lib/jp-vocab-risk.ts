import { jpVocabRiskIndex, jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabKind, JpVocabWord } from "@/lib/types";

export type JpVocabRiskRow = {
  id: number;
  name: string;
  kind: JpVocabKind;
  kindLabel: string;
  risk: number;
  familiar: number;
  normal: number;
  unknown: number;
  reviewCount: number;
};

/** risk = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
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

/** 低风险绿 / 中风险黄 / 高风险红 */
export function jpVocabRiskColor(risk: number): string {
  if (risk >= 3) return "var(--rise)";
  if (risk >= 1) return "#d4a017";
  return "var(--fall)";
}

export function buildRiskData(words: JpVocabWord[]): JpVocabRiskRow[] {
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
        risk: jpVocabRiskIndex(w),
        familiar,
        normal,
        unknown,
        reviewCount: jpVocabTotalReviews(w),
      };
    })
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name, "ja"));
}

/** 图表用：风险指数降序，高风险在上；仅展示 risk > 0（0 无柱长，负值为「已掌握」） */
export function buildRiskChartData(words: JpVocabWord[]): JpVocabRiskRow[] {
  return buildRiskData(words).filter((row) => row.risk > 0);
}

/** 未列入排行的条数（risk ≤ 0） */
export function countExcludedRiskRows(words: JpVocabWord[]): number {
  return buildRiskData(words).filter((row) => row.risk <= 0).length;
}
