import { formatUploadBytes, type UploadProgressEvent } from "@/lib/upload-form-progress";
import type { JpVocabKind } from "@/lib/types";

export const KIND_OPTIONS: { key: JpVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

export const REF_ERR = {
  zh: {
    no_ref_key: "当前词条还没有绑定教案地址，暂时不能在这里替换教案。",
    file_required: "请选择或粘贴新的教案图片 / PDF。",
    file_too_large: "文件过大（最大 20MB）",
    ref_not_found: "未找到当前教案地址，无法替换。",
    empty_file: "文件为空",
    upload_failed: "教案上传失败",
  },
  en: {
    no_ref_key: "This entry is not linked to a lesson plan yet.",
    file_required: "Please choose or paste a new lesson plan file.",
    file_too_large: "File too large (max 20MB)",
    ref_not_found: "Lesson plan not found",
    empty_file: "Empty file",
    upload_failed: "Lesson upload failed",
  },
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

export function uploadProgressLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") return "文件已传完，服务器保存中…";
  if (event.phase === "done") return "上传完成";
  if (event.total > 0) {
    return `正在上传 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) return `正在上传 ${formatUploadBytes(event.loaded)}…`;
  return "准备上传…";
}

export function noteImageUploadLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") return "图片已传完，服务器保存中…";
  if (event.phase === "done") return "图片上传完成";
  if (event.total > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) return `正在上传图片 ${formatUploadBytes(event.loaded)}…`;
  return "正在上传图片…";
}

export function noteImageUploadPercent(event: UploadProgressEvent): number {
  if (event.phase === "processing") return 95;
  if (event.phase === "done") return 100;
  return Math.max(0, Math.min(92, event.percent));
}

/** 例句/备注：按内容撑开高度，避免小框内再滚一层 */
export function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
}
