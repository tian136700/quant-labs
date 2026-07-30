"use client";

import { useCallback, useRef, useState } from "react";
import type { JpLessonCourseMergeBusy } from "@/components/jp-lesson-page/JpLessonCourseMergeCell";
import type { JpLessonCoursePair } from "@/lib/jp-lesson-course-pair";
import { jpLessonCropKind } from "@/lib/jp-lesson-shared";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressPercent,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
} from "@/lib/jp-vocab-save-progress";
import { jpVocabRefApiPath } from "@/lib/jp-vocab-ref-shared";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";
import {
  refFilename,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";

function lessonImageMedia(
  lesson: JpLessonRecord,
  refs: Record<string, JpVocabRef>
): { mediaUrl: string; filenameBase: string } | null {
  const key = lesson.ref_key;
  if (!key) return null;
  const ref = refs[key];
  if (!ref || ref.media_type !== "image") return null;
  return {
    mediaUrl: jpVocabRefApiPath(key, { v: ref.updated_at }),
    filenameBase: refFilename(lesson, ref).replace(/\.(png|jpe?g|webp|pdf)$/i, ""),
  };
}

export function useJpLessonCourseMergeCopy(opts: {
  refs: Record<string, JpVocabRef>;
  canOperate: boolean;
  onCopyToast: (message: string) => void;
  onRefSaved?: (ref: JpVocabRef) => void;
}) {
  const { refs, canOperate, onCopyToast, onRefSaved } = opts;
  const [mergeBusy, setMergeBusy] = useState<JpLessonCourseMergeBusy>(null);
  const timerRef = useRef<number | null>(null);
  const busyGroupRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const copyCourseMerge = useCallback(
    async (pair: JpLessonCoursePair) => {
      if (!canOperate) {
        onCopyToast("需要登录并具备新课编辑权限");
        return;
      }
      if (busyGroupRef.current) return;

      const wordMedia = lessonImageMedia(pair.wordLesson, refs);
      const grammarMedia = lessonImageMedia(pair.grammarLesson, refs);
      if (!wordMedia || !grammarMedia) {
        onCopyToast("整课合并需要两侧都有教案图");
        return;
      }

      busyGroupRef.current = pair.courseGroupId;
      const startedAt = Date.now();
      setMergeBusy({
        courseGroupId: pair.courseGroupId,
        percent: JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
        label: "排队同步中…",
      });

      window.setTimeout(() => {
        if (busyGroupRef.current !== pair.courseGroupId) return;
        setMergeBusy({
          courseGroupId: pair.courseGroupId,
          percent: jpVocabSaveProgressPercent(0),
          label: "正在合并整课教案…",
        });
        clearTimer();
        timerRef.current = window.setInterval(() => {
          setMergeBusy((prev) =>
            prev && prev.courseGroupId === pair.courseGroupId
              ? {
                  ...prev,
                  percent: jpVocabSaveProgressPercent(Date.now() - startedAt),
                  label: "正在合并整课教案…",
                }
              : prev
          );
        }, 200);
      }, 80);

      try {
        const { buildJpLessonCourseMergedPaginatedPdf } = await import(
          "@/lib/jp-lesson-course-merge-pdf"
        );
        const { blob, filename } = await buildJpLessonCourseMergedPaginatedPdf({
          courseLabel: pair.courseLabel,
          word: {
            mediaUrl: wordMedia.mediaUrl,
            filenameBase: wordMedia.filenameBase,
            cropKind: jpLessonCropKind(pair.wordLesson.kind),
          },
          grammar: {
            mediaUrl: grammarMedia.mediaUrl,
            filenameBase: grammarMedia.filenameBase,
            cropKind: jpLessonCropKind(pair.grammarLesson.kind),
          },
        });

        setMergeBusy((prev) =>
          prev && prev.courseGroupId === pair.courseGroupId
            ? { ...prev, label: "正在保存合并教案…" }
            : prev
        );

        const form = new FormData();
        form.set("course_group_id", pair.courseGroupId);
        form.set("course_label", pair.courseLabel);
        form.set("file", new File([blob], filename, { type: "application/pdf" }));

        const res = await fetch("/api/jp-lesson/course-merge-ref", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          ref_view_path?: string;
          ref?: JpVocabRef;
        };
        if (!res.ok || !data.ok || !data.ref_view_path) {
          throw new Error(data.error || "保存失败");
        }

        if (data.ref) onRefSaved?.(data.ref);

        const absolute = `${JP_SITE_URL}${data.ref_view_path}`;
        const ok = await copyTextToClipboard(absolute);

        await animateJpVocabSaveProgressTo100(startedAt, (p) => {
          setMergeBusy((prev) =>
            prev && prev.courseGroupId === pair.courseGroupId
              ? { ...prev, percent: p, label: "正在保存合并教案…" }
              : prev
          );
        });

        onCopyToast(ok ? "复制成功" : "复制失败");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("教案图") || message.includes("整课合并")) {
          onCopyToast(message);
        } else {
          onCopyToast("整课合并失败");
        }
      } finally {
        clearTimer();
        busyGroupRef.current = null;
        setMergeBusy(null);
      }
    },
    [canOperate, clearTimer, onCopyToast, onRefSaved, refs]
  );

  return { mergeBusy, copyCourseMerge };
}
