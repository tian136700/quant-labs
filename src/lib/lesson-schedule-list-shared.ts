/**
 * 日程管理列表：裁剪学习内容预览（日历/侧栏最多展示约 4 行）。
 * 勿把完整 meanings / 例句塞进日程 API。
 */

/** 日程预览保留的 content 项数（逗号分隔）；够 4 行展示 + 同堂合并余量 */
export const SCHEDULE_LESSON_CONTENT_PREVIEW_ITEMS = 12;

export function truncateLessonContentForSchedule(
  content: string,
  maxItems = SCHEDULE_LESSON_CONTENT_PREVIEW_ITEMS
): string {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= maxItems) return parts.join(", ");
  return `${parts.slice(0, maxItems).join(", ")}, …`;
}

/** refs 只要 updated_at（教案链接 cache-bust）；其它字段填最小占位 */
export function slimVocabRefForSchedule<T extends { ref_key: string; updated_at: string }>(
  ref: T
): Pick<T, "ref_key" | "updated_at"> & {
  title: null;
  media_type: "pdf";
  r2_key: "";
  created_at: "";
} {
  return {
    ref_key: ref.ref_key,
    title: null,
    media_type: "pdf",
    r2_key: "",
    created_at: "",
    updated_at: ref.updated_at,
  };
}
