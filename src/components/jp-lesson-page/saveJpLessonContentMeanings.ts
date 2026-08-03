import type { Dispatch, SetStateAction } from "react";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";
import { persistLessonCache } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { Locale } from "@/i18n/messages";

export type JpLessonContentSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type SaveArgs = {
  locale: Locale;
  canOperate: boolean;
  lessonId: number;
  content: string;
  meanings: string | null;
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  noteCounts: Record<number, number>;
  teachers: JpLessonTeacher[];
  setLessons: Dispatch<SetStateAction<JpLessonRecord[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setSavingContentId: Dispatch<SetStateAction<number | null>>;
  setEditingContentLesson: Dispatch<SetStateAction<JpLessonRecord | null>>;
  /** 删除后自动保存：保持弹窗打开并刷新当前课 */
  keepOpen?: boolean;
};

export async function saveJpLessonContentMeanings(
  args: SaveArgs
): Promise<JpLessonContentSaveResult> {
  const {
    locale,
    canOperate,
    lessonId,
    content,
    meanings,
    lessons,
    refs,
    noteCounts,
    teachers,
    setLessons,
    setStatus,
    setSavingContentId,
    setEditingContentLesson,
    keepOpen = false,
  } = args;

  if (!canOperate) {
    return { ok: false, error: "无操作权限" };
  }

  const snapshot = lessons.find((l) => l.id === lessonId);
  setSavingContentId(lessonId);
  setLessons((prev) =>
    prev.map((l) =>
      l.id === lessonId
        ? {
            ...l,
            content,
            meanings,
          }
        : l
    )
  );

  try {
    const res = await fetch("/api/jp-lesson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LOCALE_HEADER]: locale,
      },
      credentials: "include",
      body: JSON.stringify({
        action: "set_content",
        lesson_id: lessonId,
        content,
        meanings,
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      lesson?: JpLessonRecord;
      error?: string;
    };
    if (!data.ok || !data.lesson) {
      const msg =
        data.error === "content_empty"
          ? "学习内容不能为空"
          : data.error === "invalid_annotation"
            ? "标注无法对齐，请检查后再试"
            : data.error || "保存失败";
      throw new Error(msg);
    }
    setLessons((prev) => {
      const next = prev.map((l) => (l.id === data.lesson!.id ? data.lesson! : l));
      persistLessonCache(next, refs, noteCounts, teachers);
      return next;
    });
    if (keepOpen) {
      setEditingContentLesson(data.lesson);
      setStatus(`学习内容与释义已保存（#${lessonId}）`);
    } else {
      blurActiveElementForLessonModalClose();
      setEditingContentLesson(null);
      scrollLessonListItemIntoView(lessonId);
      setStatus(`学习内容与释义已更新（#${lessonId}）`);
    }
    window.setTimeout(() => setStatus(""), 2500);
    return { ok: true };
  } catch (err) {
    if (snapshot) {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? snapshot : l))
      );
    }
    const message = err instanceof Error ? err.message : "保存失败";
    setStatus(message);
    return { ok: false, error: message };
  } finally {
    setSavingContentId(null);
  }
}
