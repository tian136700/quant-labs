import { formatUploadBytes, type UploadProgressEvent } from "@/lib/upload-form-progress";
import { parseJpVocabClassNotes, type JpVocabClassNoteEditTarget, type JpVocabClassNoteEntry } from "@/lib/jp-vocab-class-notes";
import type { JpVocabSaveProgressKind } from "@/lib/jp-vocab-save-progress";
import type { JpVocabWord } from "@/lib/types";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export const AUTO_SAVE_MS = 1_000;
export const POLL_MS = 2_000;

export type ActionProgress = {
  kind: JpVocabSaveProgressKind;
  percent: number;
};

export function pickClipboardImage(items: DataTransferItemList): File | null {
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const ext = item.type.split("/")[1] || "png";
        return new File([blob], `pasted.${ext}`, { type: item.type });
      }
    }
  }
  return null;
}

export function noteImageUploadLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") {
    return "图片已传完，服务器保存中…";
  }
  if (event.phase === "done") {
    return "图片上传完成";
  }
  if (event.total > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)}…`;
  }
  return "正在上传图片…";
}

export function noteImageUploadPercent(event: UploadProgressEvent): number {
  if (event.phase === "processing") return 95;
  if (event.phase === "done") return 100;
  return Math.max(0, Math.min(92, event.percent));
}

export function editTargetForEntry(
  entry: JpVocabClassNoteEntry,
  index: number
): JpVocabClassNoteEditTarget {
  if (entry.timestamp) {
    return { mode: "existing-timestamp", originalTimestamp: entry.timestamp };
  }
  return { mode: "existing-index", originalIndex: index };
}

export function historyEntriesFromWord(word: JpVocabWord | null): JpVocabClassNoteEntry[] {
  if (!word) return [];
  return parseJpVocabClassNotes(word.class_notes);
}

