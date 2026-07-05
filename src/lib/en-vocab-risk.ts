import { enVocabRiskIndex, enVocabTotalReviews } from "@/lib/en-vocab-shared";
import type { EnVocabKind, EnVocabWord } from "@/lib/types";

export type EnVocabRiskRow = {
  id: number;
  name: string;
  kind: EnVocabKind;
  kindLabel: string;
  risk: number;
  familiar: number;
  normal: number;
  unknown: number;
  reviewCount: number;
};

/** risk = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function calcEnVocabRisk(
  familiar: number,
  normal: number,
  unknown: number
): number {
  const raw = normal * 1 + unknown * 2 - familiar * 0.3;
  return Math.round(raw * 10) / 10;
}

export function enVocabKindLabel(kind: EnVocabKind): string {
  return kind === "grammar" ? "语法" : "单词";
}

/** 低风险绿 / 中风险黄 / 高风险红 */
export function enVocabRiskColor(risk: number): string {
  if (risk >= 3) return "var(--rise)";
  if (risk >= 1) return "#d4a017";
  return "var(--fall)";
}

export function buildRiskData(words: EnVocabWord[]): EnVocabRiskRow[] {
  return words
    .map((w) => {
      const familiar = w.cnt_very;
      const normal = w.cnt_normal;
      const unknown = w.cnt_weak;
      return {
        id: w.id,
        name: w.word,
        kind: w.kind,
        kindLabel: enVocabKindLabel(w.kind),
        risk: enVocabRiskIndex(w),
        familiar,
        normal,
        unknown,
        reviewCount: enVocabTotalReviews(w),
      };
    })
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name, "en"));
}

/** 图表用：风险指数降序，高风险在上；仅展示 risk > 0（0 无柱长，负值为「已掌握」） */
export function buildRiskChartData(words: EnVocabWord[]): EnVocabRiskRow[] {
  return buildRiskData(words).filter((row) => row.risk > 0);
}

/** 未列入排行的条数（risk ≤ 0） */
export function countExcludedRiskRows(words: EnVocabWord[]): number {
  return buildRiskData(words).filter((row) => row.risk <= 0).length;
}
