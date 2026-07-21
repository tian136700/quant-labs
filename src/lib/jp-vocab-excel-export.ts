import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import { jpVocabRiskIndex, jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";

/** 与线上一致的算法说明，单独一张表放在最前，便于整份 Excel 丢给 AI。 */
export function buildJpVocabReviewStatsExportRules(date: string): string[] {
  return [
    "╔════════════════════════════════════════════════════════════╗",
    "║  日语抽问 · 当前抽查优先级算法规则（导出供 AI 复盘）        ║",
    "╚════════════════════════════════════════════════════════════╝",
    "",
    `导出日期（北京时间）：${date}`,
    "说明：下一张表「复习次数统计」是全库词条的计数数据；本框为现行规则原文。",
    "请根据本规则理解数据列含义；若要用艾宾浩斯遗忘曲线重算排程，请提出新公式与迁移建议。",
    "",
    "━━━━━━━━━━━━━━━━ 1. 熟悉程度计数 ━━━━━━━━━━━━━━━━",
    "每次抽查勾选其一：非常熟悉 / 一般 / 不熟悉，对应计数各 +1。",
    "总共抽查次数 = 非常熟悉次数 + 一般次数 + 不熟悉次数。",
    "同一天内改选熟悉程度（如「非常熟悉」改「一般」）：视为修正，按最后一次勾选更新三项统计；",
    "「今日抽查次数」不重复 +1，北京时间 0 点归零。",
    "",
    "━━━━━━━━━━━━━━━━ 2. 抽查优先级（抽查权重）公式 ━━━━━━━━━━━━━━━━",
    "抽查优先级 = 一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3",
    "结果保留 1 位小数。",
    "含义：数值越大，越应该被优先抽查（卡片上称「抽查权重」）。",
    "阈值参考（产品文案）：",
    "  · ≥ 3  → 建议重点抽查",
    "  · ≥ 1  → 建议留意",
    "  · < 1  → 掌握较好",
    "  · ≤ 0  → 尚未复习，或多次勾选「非常熟悉」",
    "",
    "━━━━━━━━━━━━━━━━ 3. 每日序号重排（北京时间 0 点） ━━━━━━━━━━━━━━━━",
    "每天凌晨按下列顺序重排当日序号（当天内勾选/刷新不改顺序，各老师看到同一顺序）：",
    "  1) 管理员标记的「明日优先」按点击顺序 1、2、3…（仅生效日当天；不清历史计数）",
    "  2) 可置顶的从未抽查词（入库日早于今日）在前",
    "  3) 其余按抽查优先级降序",
    "  4) 今日刚入库且从未抽查的沉底（今天不抽，明天再置顶）",
    "",
    "━━━━━━━━━━━━━━━━ 4. 今日抽查池 ━━━━━━━━━━━━━━━━",
    "管理员设定今日抽查数量 N 后：可见池 = 当日序号正序 1…N。",
    "今日新入库、从未抽查的词不进当日池。",
    "",
    "━━━━━━━━━━━━━━━━ 5. 数据表列说明 ━━━━━━━━━━━━━━━━",
    "单词ID / 单词名字 / 类型：词条标识。",
    "不熟悉次数 / 一般次数 / 非常熟悉次数：历史累计勾选次数。",
    "总共抽查次数：上述三项之和。",
    "抽查优先级：按第 2 节公式由三项次数现算（与线上一致）。",
    "",
    "代码锚点（便于对照实现）：",
    "  jpVocabRiskIndex / jpVocabTotalReviews → src/lib/jp-vocab-shared.ts",
    "  sortJpVocabWordsForDailyOrder → 同文件",
    "  今日抽查池 → src/lib/jp-vocab-teacher-visible.ts",
  ];
}

/**
 * 管理员端导出复习次数统计到 Excel（艾宾浩斯等算法复盘用）。
 * 第一张表写现行规则；第二张表写词条计数。
 * `xlsx` 仅在点击导出时动态加载，避免打进 Worker 主包。
 */
export async function exportJpVocabReviewStatsToExcel(
  words: JpVocabWord[],
  displayOrder?: JpVocabDailyDisplayOrder
): Promise<void> {
  if (!words.length) {
    throw new Error("单词表为空，无法导出。");
  }

  const ordered =
    displayOrder && displayOrder.ids.length > 0
      ? jpVocabWordsInOrder(words, displayOrder.ids)
      : [...words];

  const XLSX = await import("xlsx");
  const date = beijingDateString();
  const wb = XLSX.utils.book_new();

  const ruleLines = buildJpVocabReviewStatsExportRules(date);
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
    抽查优先级: jpVocabRiskIndex(w),
  }));

  const dataWs = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, dataWs, "复习次数统计");

  XLSX.writeFile(wb, `日语复习次数统计-${date}.xlsx`);
}
