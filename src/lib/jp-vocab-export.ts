import { jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const LEVEL_LABELS: Record<JpVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};

function needsReview(word: JpVocabWord): boolean {
  const total = jpVocabTotalReviews(word);
  if (total === 0) return true;
  return word.cnt_weak >= word.cnt_very;
}

function reviewStatus(
  word: JpVocabWord,
  sessionLevel?: Record<number, JpVocabLevel | undefined>
): string {
  const selected = sessionLevel?.[word.id];
  if (!selected) return "未勾选";
  return needsReview(word) ? "需复习" : "良好";
}

export async function exportJpVocabToExcel(
  words: JpVocabWord[],
  refs: Record<string, JpVocabRef>,
  sessionLevel?: Record<number, JpVocabLevel | undefined>
): Promise<void> {
  const XLSX = await import("xlsx");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const rows = words.map((w) => {
    const ref = w.ref_key ? refs[w.ref_key] : undefined;
    const refUrl = w.ref_key
      ? `${origin}/api/jp-vocab/ref/${encodeURIComponent(w.ref_key)}`
      : "";
    const selected = sessionLevel?.[w.id];

    return {
      类型: w.kind === "grammar" ? "语法" : "单词",
      "单词 / 语法": w.word,
      读音: w.reading ?? "",
      释义: w.meaning ?? "",
      课堂笔记: w.class_notes ?? "",
      本轮熟悉程度: selected ? LEVEL_LABELS[selected] : "",
      非常熟悉: w.cnt_very,
      一般: w.cnt_normal,
      不熟悉: w.cnt_weak,
      复习合计: jpVocabTotalReviews(w),
      状态: reviewStatus(w, sessionLevel),
      教案标题: ref?.title ?? "",
      教案链接: refUrl,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "单词表");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `日语单词表-${date}.xlsx`);
}
