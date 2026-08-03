import type { Dispatch, SetStateAction } from "react";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";
import { persistLessonCache } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { Locale } from "@/i18n/messages";

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
};

export async function saveJpLessonContentMeanings(args: SaveArgs): Promise<void> {
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
  } = args;

  if (!canOperate) return;

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
    blurActiveElementForLessonModalClose();
    setEditingContentLesson(null);
    scrollLessonListItemIntoView(lessonId);
    setStatus(`学习内容与释义已更新（#${lessonId}）`);
    window.setTimeout(() => setStatus(""), 2500);
  } catch (err) {
    if (snapshot) {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? snapshot : l))
      );
    }
    setStatus(err instanceof Error ? err.message : "保存失败");
  } finally {
    setSavingContentId(null);
  }
}
