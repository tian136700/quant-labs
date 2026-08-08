/**
 * 浏览器端：POST /api/jp-lesson/ref/attach-batch 挂教案图。
 */

import type { JpLessonRecord, JpVocabRef } from "@/lib/types";

export type JpLessonRefAttachBatchOk = {
  ok: true;
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  count: number;
};

export type JpLessonRefAttachBatchResult =
  | JpLessonRefAttachBatchOk
  | { ok: false; error: string };

export async function postJpLessonRefAttachBatch(
  lessonIds: number[],
  file: File
): Promise<JpLessonRefAttachBatchResult> {
  if (!lessonIds.length) {
    return { ok: false, error: "没有要挂教案的课程。" };
  }
  const form = new FormData();
  form.set("lesson_ids", JSON.stringify(lessonIds));
  form.set("file", file, file.name || "plan.png");
  if (file.type === "application/pdf") {
    form.set("media_type", "pdf");
  } else {
    form.set("media_type", "image");
  }

  const res = await fetch("/api/jp-lesson/ref/attach-batch", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const data = (await res.json()) as JpLessonRefAttachBatchOk & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `挂教案失败（${res.status}）`,
    };
  }
  return {
    ok: true,
    lessons: data.lessons,
    refs: data.refs,
    count: data.count,
  };
}
