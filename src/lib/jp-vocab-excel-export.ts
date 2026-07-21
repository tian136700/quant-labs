import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
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
    `当前时间权重（quiz_time_weight）：${weight}`,
    "说明：下一张表「复习次数统计」是全库词条的计数数据；本框为现行规则原文。",
    "请根据本规则理解数据列含义；若要用艾宾浩斯遗忘曲线重算排程，请提出新公式与迁移建议。",
    "",
    "━━━━━━━━━━━━━━━━ 1. 熟悉程度计数 ━━━━━━━━━━━━━━━━",
    "每次抽查勾选其一：非常熟悉 / 一般 / 不熟悉，对应计数各 +1。",
    "总共抽查次数 = 非常熟悉次数 + 一般次数 + 不熟悉次数。",
    "同一天内改选熟悉程度（如「非常熟悉」改「一般」）：视为修正，按最后一次勾选更新三项统计；",
    "「今日抽查次数」不重复 +1，北京时间 0 点归零。",
    "每次勾选会写入 last_review_at（最后一次抽问时间；无单独 last_review_date 列）。",
    "",
    "━━━━━━━━━━━━━━━━ 2. 基础抽查优先级（priority） ━━━━━━━━━━━━━━━━",
    "priority = 一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3",
    "结果保留 1 位小数。",
    "含义：不熟悉抬高、非常熟悉压低；单独使用会导致「很久没抽的老词永远排不到」。",
    "",
    "━━━━━━━━━━━━━━━━ 3. 最终抽问得分（final_score，日序用这个） ━━━━━━━━━━━━━━━━",
    `final_score = priority + (距上次抽问天数 × 时间权重)`,
    `当前时间权重 = ${weight}（存 jp_vocab_setting.quiz_time_weight；管理员端可改 0.05/0.1/0.2/0.3 等）`,
    "距上次抽问天数：优先 last_review_at 的北京日历日；缺省回退入库日 created_at；再缺则 0。",
    "例：priority=-3、权重=0.1、40 天未抽 → final_score = -3 + 4 = 1，会重新进入抽问范围。",
    "改权重后于次日凌晨或「今日重置」重排生效，不打断当天已生成的抽查池。",
    "",
    "━━━━━━━━━━━━━━━━ 4. 每日序号重排（北京时间 0 点） ━━━━━━━━━━━━━━━━",
    "每天凌晨按下列顺序重排当日序号（当天内勾选/刷新不改顺序，各老师看到同一顺序）：",
    "  1) 管理员标记的「明日优先」按点击顺序 1、2、3…（仅生效日当天；不清历史计数）",
    "  2) 可置顶的从未抽查词（入库日早于今日）在前",
    "  3) 其余按 final_score 降序（不是只按 priority）",
    "  4) 今日刚入库且从未抽查的沉底（今天不抽，明天再置顶）",
    "",
    "━━━━━━━━━━━━━━━━ 5. 今日抽查池 ━━━━━━━━━━━━━━━━",
    "管理员设定今日抽查数量 N 后：可见池 = 当日序号正序 1…N。",
    "今日新入库、从未抽查的词不进当日池。",
    "",
    "━━━━━━━━━━━━━━━━ 6. 数据表列说明 ━━━━━━━━━━━━━━━━",
    "单词ID / 单词名字 / 类型：词条标识。",
    "不熟悉次数 / 一般次数 / 非常熟悉次数：历史累计勾选次数。",
    "总共抽查次数：上述三项之和。",
    "抽查优先级(基础)：仅第 2 节 priority。",
    "距上次抽问天数：第 3 节 days。",
    "最终抽问得分：priority + days × 权重（与线上日序一致）。",
    "",
    "代码锚点（便于对照实现）：",
    "  jpVocabFinalQuizScore / jpVocabDaysSinceLastReview → src/lib/jp-vocab-quiz-score.ts",
    "  jpVocabRiskIndex / sortJpVocabWordsForDailyOrder → src/lib/jp-vocab-shared.ts",
    "  今日抽查池 → src/lib/jp-vocab-teacher-visible.ts",
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

  const rows = ordered.map((w) => ({
    单词ID: w.id,
    单词名字: w.word,
    类型: w.kind === "grammar" ? "语法" : "单词",
    不熟悉次数: w.cnt_weak,
    一般次数: w.cnt_normal,
    非常熟悉次数: w.cnt_very,
    总共抽查次数: jpVocabTotalReviews(w),
    "抽查优先级(基础)": jpVocabRiskIndex(w),
    距上次抽问天数: jpVocabDaysSinceLastReview(w, now),
    最终抽问得分: jpVocabFinalQuizScore(w, weight, now),
    时间权重: weight,
  }));

  const dataWs = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, dataWs, "复习次数统计");

  XLSX.writeFile(wb, `日语复习次数统计-${date}.xlsx`);
}
