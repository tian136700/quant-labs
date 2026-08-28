import { beijingDateString, effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { enVocabTotalReviews } from "@/lib/en-vocab-shared";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";

export type EnVocabTeacherQuizPreviewExportWord = Pick<
  EnVocabWord,
  "word" | "meaning" | "kind"
>;

/** 老师端开场：导出今日抽查池（单词/语法 + 释义），便于开抽前预览 */
export async function exportEnVocabTeacherQuizPreviewToExcel(
  words: readonly EnVocabTeacherQuizPreviewExportWord[]
): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = words.map((w, index) => ({
    序号: index + 1,
    类型: w.kind === "grammar" ? "语法" : "单词",
    "单词 / 语法": w.word,
    释义: (w.meaning ?? "").trim(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "今日抽查");

  const date = beijingDateString();
  XLSX.writeFile(wb, `英语今日抽查预览-${date}.xlsx`);
}

const LEVEL_LABELS: Record<EnVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};

export async function exportEnVocabToExcel(
  words: EnVocabWord[],
  refs: Record<string, EnVocabRef>,
  sessionLevel?: Record<number, EnVocabLevel | undefined>
): Promise<void> {
  const XLSX = await import("xlsx");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const rows = words.map((w) => {
    const ref = w.ref_key ? refs[w.ref_key] : undefined;
    const refUrl = w.ref_key
      ? `${origin}/api/en-vocab/ref/${encodeURIComponent(w.ref_key)}`
      : "";
    const selected = sessionLevel?.[w.id];

    return {
      ID: w.id,
      类型: w.kind === "grammar" ? "语法" : "单词",
      "单词 / 语法": w.word,
      读音: w.reading ?? "",
      释义: w.meaning ?? "",
      词性: w.pos ?? "",
      课堂笔记: w.class_notes ?? "",
      本轮熟悉程度: selected ? LEVEL_LABELS[selected] : "",
      非常熟悉: w.cnt_very,
      一般: w.cnt_normal,
      不熟悉: w.cnt_weak,
      复习合计: enVocabTotalReviews(w),
      今日抽查次数: effectiveTodayCheckCount(
        w.today_check_count ?? 0,
        w.today_check_date
      ),
      教案标题: ref?.title ?? "",
      教案链接: refUrl,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "单词表");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `英语单词表-${date}.xlsx`);
}
