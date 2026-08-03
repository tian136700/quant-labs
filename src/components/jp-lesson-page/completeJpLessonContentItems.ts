import type { Dispatch, SetStateAction } from "react";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpLessonVocabSyncPlan } from "@/lib/jp-lesson-vocab-sync-shared";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";
import { persistLessonCache } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import {
  JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
  JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL,
  runJpLessonVocabSyncChunks,
  type JpLessonVocabSyncProgress,
} from "@/components/jp-lesson-page/runJpLessonVocabSyncChunks";
import type { Locale } from "@/i18n/messages";

type VocabSyncEntry = {
  lesson_id: number;
  vocab_sync: JpLessonVocabSyncPlan;
};

/** 标完成客户端结果；Modals props 须能接住，勿收窄成 Promise<void>（会挂 next build） */
export type JpLessonCompleteContentItemsResult =
  | { ok: true }
  | { ok: false; error: string };

type CompleteArgs = {
  locale: Locale;
  canOperate: boolean;
  lessonId: number;
  itemIndexes: number[];
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  noteCounts: Record<number, number>;
  teachers: JpLessonTeacher[];
  setLessons: Dispatch<SetStateAction<JpLessonRecord[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setSavingContentId: Dispatch<SetStateAction<number | null>>;
  setEditingContentLesson: Dispatch<SetStateAction<JpLessonRecord | null>>;
  setVocabSyncProgress: Dispatch<
    SetStateAction<JpLessonVocabSyncProgress | null>
  >;
};

/**
 * 编辑弹窗：熟悉项标完成 → 拆成已完成课 + 分片 sync 抽问。
 */
export async function completeJpLessonContentItemsClient(
  args: CompleteArgs
): Promise<JpLessonCompleteContentItemsResult> {
  const {
    locale,
    canOperate,
    lessonId,
    itemIndexes,
    lessons,
    refs,
    noteCounts,
    teachers,
    setLessons,
    setStatus,
    setSavingContentId,
    setEditingContentLesson,
    setVocabSyncProgress,
  } = args;

  if (!canOperate) {
    return { ok: false, error: "无操作权限" };
  }
  if (!itemIndexes.length) {
    return { ok: false, error: "请先选择要标完成的项" };
  }

  const snapshot = lessons.find((l) => l.id === lessonId) ?? null;
  setSavingContentId(lessonId);
  setVocabSyncProgress({
    lessonId,
    synced: 0,
    total: itemIndexes.length,
    percent: 8,
    label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
  });

  try {
    const res = await fetch("/api/jp-lesson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LOCALE_HEADER]: locale,
      },
      credentials: "include",
      body: JSON.stringify({
        action: "complete_content_items",
        lesson_id: lessonId,
        item_indexes: itemIndexes,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      source_lesson?: JpLessonRecord | null;
      source_deleted?: boolean;
      created_lessons?: JpLessonRecord[];
      vocab_syncs?: VocabSyncEntry[];
      error?: string;
    };

    if (!data.ok) {
      const msg =
        data.error === "lesson_already_completed"
          ? "已完成的课不能再拆项标完成"
          : data.error === "item_indexes_invalid"
            ? "选中的项无效，请关闭弹窗后重试"
            : data.error === "item_indexes_empty"
              ? "请先选择要标完成的项"
              : data.error || "标完成失败";
      throw new Error(msg);
    }

    const created = data.created_lessons || [];
    const sourceDeleted = Boolean(data.source_deleted);
    const sourceLesson = data.source_lesson ?? null;

    setLessons((prev) => {
      let next = prev.slice();
      if (sourceDeleted) {
        next = next.filter((l) => l.id !== lessonId);
      } else if (sourceLesson) {
        next = next.map((l) =>
          l.id === sourceLesson.id ? sourceLesson : l
        );
      }
      const existingIds = new Set(next.map((l) => l.id));
      for (const lesson of created) {
        if (!existingIds.has(lesson.id)) {
          next = [lesson, ...next];
          existingIds.add(lesson.id);
        } else {
          next = next.map((l) => (l.id === lesson.id ? lesson : l));
        }
      }
      persistLessonCache(next, refs, noteCounts, teachers);
      return next;
    });

    const syncs = data.vocab_syncs || [];
    for (let i = 0; i < syncs.length; i++) {
      const entry = syncs[i];
      if (!entry?.vocab_sync?.needed) continue;
      const syncResult = await runJpLessonVocabSyncChunks({
        locale,
        plan: entry.vocab_sync,
        lessonId: entry.lesson_id,
        onProgress: (p) => {
          const base = Math.round((i / Math.max(1, syncs.length)) * 80);
          const slice = Math.round((p.percent / 100) * (80 / Math.max(1, syncs.length)));
          setVocabSyncProgress({
            ...p,
            percent: Math.min(92, Math.max(10, base + slice)),
            label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
          });
        },
      });
      if (!syncResult.ok) {
        throw new Error(syncResult.error || "同步到日语抽问失败");
      }
    }

    setVocabSyncProgress({
      lessonId,
      synced: syncs.length,
      total: syncs.length || created.length,
      percent: 100,
      label: JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL,
    });

    const count = created.length;
    setStatus(
      `${JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL}（已拆出 ${count} 条已完成课并同步抽问）`
    );

    if (sourceDeleted) {
      blurActiveElementForLessonModalClose();
      setEditingContentLesson(null);
      if (created[0]) {
        scrollLessonListItemIntoView(created[0].id);
      }
    } else if (sourceLesson) {
      setEditingContentLesson(sourceLesson);
      scrollLessonListItemIntoView(sourceLesson.id);
    }

    window.setTimeout(() => {
      setStatus("");
      setVocabSyncProgress(null);
    }, 2200);

    return { ok: true };
  } catch (err) {
    if (snapshot) {
      setLessons((prev) => {
        const has = prev.some((l) => l.id === snapshot.id);
        const next = has
          ? prev.map((l) => (l.id === snapshot.id ? snapshot : l))
          : [snapshot, ...prev];
        persistLessonCache(next, refs, noteCounts, teachers);
        return next;
      });
      setEditingContentLesson(snapshot);
    }
    const message = err instanceof Error ? err.message : "标完成失败";
    setStatus(message);
    setVocabSyncProgress(null);
    return { ok: false, error: message };
  } finally {
    setSavingContentId(null);
  }
}
