import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabAppliesFinalQuizScore,
  jpVocabDaysSinceLastReview,
  jpVocabFinalQuizScore,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import { jpVocabRiskIndex, jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";

/** 与线上一致的算法说明，单独一张表放在最前，便于整份 Excel 丢给 AI。 */
export function buildJpVocabReviewStatsExportRules(
  date: string,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
): string[] {
  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  return [
    "╔════════════════════════════════════════════════════════════╗",
    "║  日语抽问 · 当前抽查优先级算法规则（导出供 AI 复盘）        ║",
    "╚════════════════════════════════════════════════════════════╝",
    "",
    `导出日期（北京时间）：${date}`,
    `当前时间权重（quiz_time_weight）：${weight}（固定，不可调）`,
    "说明：下一张表「复习次数统计」是全库词条的计数数据；本框为现行规则原文。",
    "请根据本规则理解数据列含义；若要用艾宾浩斯遗忘曲线重算排程，请提出新公式与迁移建议。",
    "",
    "━━━━━━━━━━━━━━━━ 0. 日序总览（重要） ━━━━━━━━━━━━━━━━",
    "凌晨重排当日序号时：",
    "  1) 管理员「明日优先」",
    "  2) 从未抽查（合计=0，且入库日早于今日）→ 默认排最前；**不算 priority / final_score**",
    "  3) 已抽查过的词 → 先按 SRS 到期日，同档再用 final_score 打平",
    "  4) 今日刚入库且从未抽查 → 沉底（今天不抽）",
    "从未抽查在列表/卡片上显示「—」，不要用公式给它们打分。",
    "",
    "━━━━━━━━━━━━━━━━ 1. 熟悉程度计数 ━━━━━━━━━━━━━━━━",
    "每次抽查勾选其一：非常熟悉 / 一般 / 不熟悉，对应计数各 +1。",
    "总共抽查次数 = 非常熟悉次数 + 一般次数 + 不熟悉次数。",
    "合计为 0 = 从未抽查。",
    "同一天内改选熟悉程度（如「非常熟悉」改「一般」）：视为修正，按最后一次勾选更新三项统计；",
    "「今日抽查次数」不重复 +1，北京时间 0 点归零。",
    "每次勾选会写入 last_review_at（最后一次抽问时间；无单独 last_review_date 列）。",
    "",
    "━━━━━━━━━━━━━━━━ 2. 基础抽查优先级（priority，仅已抽查词） ━━━━━━━━━━━━━━━━",
    "priority = 一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3",
    "结果保留 1 位小数。从未抽查不计算此项。",
    "",
    "━━━━━━━━━━━━━━━━ 3. 最终抽问得分（final_score，仅已抽查词） ━━━━━━━━━━━━━━━━",
    `final_score = priority + (距上次抽问天数 × 时间权重)`,
    `当前时间权重 = ${weight}`,
    "距上次抽问天数：优先 last_review_at；缺省回退 created_at；再缺则 0。",
    "例：priority=-3、权重=0.1、40 天未抽 → final_score = 1，会重新进入已抽查词的排序前列。",
    "改权重后于次日凌晨或「今日重置」重排生效。",
    "",
    "━━━━━━━━━━━━━━━━ 4. 今日抽查池 ━━━━━━━━━━━━━━━━",
    "管理员设定今日抽查数量 N 后：可见池 = 当日序号正序 1…N。",
    "今日新入库、从未抽查的词不进当日池。",
    "",
    "━━━━━━━━━━━━━━━━ 5. 数据表列说明 ━━━━━━━━━━━━━━━━",
    "从未抽查行：抽查优先级(基础) / 距上次抽问天数 / 最终抽问得分 均为「—」。",
    "已抽查行：见第 2、3 节。",
    "",
    "代码锚点：",
    "  jpVocabAppliesFinalQuizScore / jpVocabFinalQuizScoreOrNull → src/lib/jp-vocab-quiz-score.ts",
    "  sortJpVocabWordsForDailyOrder → src/lib/jp-vocab-shared.ts",
  ];
}

/**
 * 管理员端导出复习次数统计到 Excel（艾宾浩斯等算法复盘用）。
 * 第一张表写现行规则；第二张表写词条计数 + final_score。
 * `xlsx` 仅在点击导出时动态加载，避免打进 Worker 主包。
 */
export async function exportJpVocabReviewStatsToExcel(
  words: JpVocabWord[],
  displayOrder?: JpVocabDailyDisplayOrder,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
): Promise<void> {
  if (!words.length) {
    throw new Error("单词表为空，无法导出。");
  }

  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  const now = new Date();

  const ordered =
    displayOrder && displayOrder.ids.length > 0
      ? jpVocabWordsInOrder(words, displayOrder.ids)
      : [...words];

  const XLSX = await import("xlsx");
  const date = beijingDateString();
  const wb = XLSX.utils.book_new();

  const ruleLines = buildJpVocabReviewStatsExportRules(date, weight);
  const rulesWs = XLSX.utils.aoa_to_sheet(ruleLines.map((line) => [line]));
  rulesWs["!cols"] = [{ wch: 108 }];
  XLSX.utils.book_append_sheet(wb, rulesWs, "规则说明");

  const rows = ordered.map((w) => {
    const applies = jpVocabAppliesFinalQuizScore(w);
    return {
      单词ID: w.id,
      单词名字: w.word,
      类型: w.kind === "grammar" ? "语法" : "单词",
      不熟悉次数: w.cnt_weak,
      一般次数: w.cnt_normal,
      非常熟悉次数: w.cnt_very,
      总共抽查次数: jpVocabTotalReviews(w),
      "抽查优先级(基础)": applies ? jpVocabRiskIndex(w) : "—",
      距上次抽问天数: applies ? jpVocabDaysSinceLastReview(w, now) : "—",
      最终抽问得分: applies ? jpVocabFinalQuizScore(w, weight, now) : "—",
      时间权重: weight,
    };
  });

  const dataWs = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, dataWs, "复习次数统计");

  XLSX.writeFile(wb, `日语复习次数统计-${date}.xlsx`);
}
