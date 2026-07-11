import {
  normalizeJpVocabTeacherVisibleLimit,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";

/** 页面可见时轮询间隔（finance 管理员改数量 → japanese 老师端同步） */
export const JP_VOCAB_TEACHER_VISIBLE_POLL_MS = 3_000;

/** 标签页在后台时降频 */
export const JP_VOCAB_TEACHER_VISIBLE_POLL_HIDDEN_MS = 8_000;

export function jpVocabTeacherVisibleFingerprint(
  limit: Pick<
    JpVocabTeacherVisibleLimit,
    "date" | "quiz_target" | "quiz_target_adjusted_at"
  >
): string {
  return [
    limit.date,
    Math.floor(limit.quiz_target),
    limit.quiz_target_adjusted_at ?? "",
  ].join("\0");
}

export async function fetchJpVocabTeacherVisibleLimit(): Promise<JpVocabTeacherVisibleLimit | null> {
  const res = await fetch("/api/jp-vocab/teacher-visible", {
    credentials: "include",
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    teacher_visible_limit?: Partial<JpVocabTeacherVisibleLimit>;
  };
  if (!data.ok || !data.teacher_visible_limit) return null;
  return normalizeJpVocabTeacherVisibleLimit(data.teacher_visible_limit);
}
