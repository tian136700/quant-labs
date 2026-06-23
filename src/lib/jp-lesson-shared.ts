/** 将上传时的 content 拆成单个单词/语法项（与后端入库逻辑一致） */
export function parseLessonContent(raw: string): string[] {
  return (raw || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type JpLessonProgressStatus = "pending" | "learning" | "completed";

export function getJpLessonProgressStatus(lesson: {
  completed: boolean;
  learning?: boolean;
}): JpLessonProgressStatus {
  if (lesson.completed) return "completed";
  if (lesson.learning) return "learning";
  return "pending";
}

export function jpLessonProgressToFields(
  status: JpLessonProgressStatus
): { completed: boolean; learning: boolean } {
  switch (status) {
    case "completed":
      return { completed: true, learning: false };
    case "learning":
      return { completed: false, learning: true };
    default:
      return { completed: false, learning: false };
  }
}

export function isJpLessonSyncedToVocab(lesson: {
  completed: boolean;
}): boolean {
  return lesson.completed;
}

/** 列表排序：学习中 → 未完成 → 已完成 */
export function jpLessonProgressSortRank(lesson: {
  completed: boolean;
  learning?: boolean;
}): number {
  const status = getJpLessonProgressStatus(lesson);
  switch (status) {
    case "learning":
      return 0;
    case "pending":
      return 1;
    case "completed":
      return 2;
  }
}

export function compareJpLessonsByProgress(
  a: { completed: boolean; learning?: boolean; uploaded_at: string; id: number },
  b: { completed: boolean; learning?: boolean; uploaded_at: string; id: number }
): number {
  const rankCmp = jpLessonProgressSortRank(a) - jpLessonProgressSortRank(b);
  if (rankCmp !== 0) return rankCmp;
  const dateCmp = b.uploaded_at.localeCompare(a.uploaded_at);
  if (dateCmp !== 0) return dateCmp;
  return b.id - a.id;
}
