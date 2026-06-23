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
