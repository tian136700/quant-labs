"use client";

import { useCallback, useRef, useState } from "react";
import type { Locale } from "@/i18n/messages";
import {
  filterEnLessonImportManualSchedules,
  lessonHasAssignedTeachers,
} from "@/lib/en-lesson-import-schedule";
import { getLessonClassSchedules } from "@/lib/en-lesson-shared";
import {
  fetchJpLessonManualSchedules,
  updateJpLessonManualSchedule,
  type JpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule";
import {
  linkedLessonKey,
  MANUAL_SCHEDULE_LINKED_LESSONS_MAX,
  normalizeManualScheduleLinkedLessons,
} from "@/lib/jp-lesson-manual-schedule-linked";
import {
  syncManualScheduleLinkedLessonErrorMessage,
  syncManualScheduleLinkedLessonToLearning,
} from "@/lib/manual-schedule-sync-linked-lesson";
import {
  animateJpVocabSaveProgressTo100,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import type { EnLessonRecord, EnLessonTeacher } from "@/lib/types";

type Options = {
  locale: Locale;
  teachers: EnLessonTeacher[];
  canOperate: boolean;
  onLessonSynced: (lesson: EnLessonRecord) => void;
  onStatus: (message: string) => void;
};

export function useEnLessonImportSchedule({
  locale,
  teachers,
  canOperate,
  onLessonSynced,
  onStatus,
}: Options) {
  const [openLesson, setOpenLesson] = useState<EnLessonRecord | null>(null);
  const [candidates, setCandidates] = useState<JpLessonManualSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [emptyHint, setEmptyHint] = useState<string | null>(null);
  const importingRef = useRef(false);

  const closeImportSchedule = useCallback(() => {
    if (importingRef.current) return;
    setOpenLesson(null);
    setCandidates([]);
    setError("");
    setEmptyHint(null);
    setProgressPercent(null);
  }, []);

  const openImportSchedule = useCallback(
    async (lesson: EnLessonRecord) => {
      if (!canOperate || importingRef.current) return;
      setOpenLesson(lesson);
      setError("");
      setEmptyHint(null);
      setProgressPercent(null);
      setLoading(true);
      try {
        const manuals = await fetchJpLessonManualSchedules();
        const filtered = filterEnLessonImportManualSchedules(manuals, teachers);
        setCandidates(filtered);
        if (!filtered.length) {
          setEmptyHint("暂无未上完的英语手动日程可引入");
        }
      } catch (err) {
        setCandidates([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [canOperate, teachers]
  );

  const importManualSchedule = useCallback(
    async (manual: JpLessonManualSchedule) => {
      const lesson = openLesson;
      if (!lesson || !canOperate || importingRef.current) return;

      const existingLinks = normalizeManualScheduleLinkedLessons(
        manual.linked_lessons
      );
      const linkKey = linkedLessonKey({ subject: "en", lesson_id: lesson.id });
      if (existingLinks.some((link) => linkedLessonKey(link) === linkKey)) {
        setError("该日程已关联本教案");
        return;
      }
      if (existingLinks.length >= MANUAL_SCHEDULE_LINKED_LESSONS_MAX) {
        setError("该日程已关联 2 本教材，无法再引入");
        return;
      }

      const nextLinks = normalizeManualScheduleLinkedLessons([
        ...existingLinks,
        { subject: "en", lesson_id: lesson.id },
      ]);

      importingRef.current = true;
      setImporting(true);
      setError("");
      setProgressPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        setProgressPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
      }, 120);

      try {
        const existingSchedules = getLessonClassSchedules(lesson).map((row) => ({
          class_at: row.class_at,
          duration_minutes: row.duration_minutes,
        }));
        const syncResult = await syncManualScheduleLinkedLessonToLearning({
          subject: "en",
          lessonId: lesson.id,
          classAt: manual.class_at,
          durationMinutes: manual.duration_minutes,
          teacherName: manual.teacher,
          teachers,
          locale,
          existingSchedules,
          preserveExistingTeachers: true,
          lessonHasTeachers: lessonHasAssignedTeachers(lesson),
        });
        if (!syncResult.ok) {
          throw new Error(
            syncManualScheduleLinkedLessonErrorMessage(syncResult.error)
          );
        }
        onLessonSynced(syncResult.lesson as EnLessonRecord);

        const saved = await updateJpLessonManualSchedule(manual.id, {
          title: manual.title,
          class_at: manual.class_at,
          duration_minutes: manual.duration_minutes,
          teacher: manual.teacher,
          note: manual.note,
          linked_lessons: nextLinks,
        });
        if (!saved) {
          throw new Error("保存日程关联失败");
        }

        await animateJpVocabSaveProgressTo100(startedAt, setProgressPercent);
        setOpenLesson(null);
        setCandidates([]);
        setProgressPercent(null);
        onStatus("已引入日程，教案已关联并设为上课中");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setProgressPercent(null);
      } finally {
        window.clearInterval(timer);
        importingRef.current = false;
        setImporting(false);
      }
    },
    [canOperate, locale, onLessonSynced, onStatus, openLesson, teachers]
  );

  return {
    importScheduleOpen: openLesson != null,
    importScheduleLessonId: openLesson?.id ?? null,
    importScheduleCandidates: candidates,
    importScheduleLoading: loading,
    importScheduleImporting: importing,
    importScheduleProgressPercent: progressPercent,
    importScheduleError: error,
    importScheduleEmptyHint: emptyHint,
    openImportSchedule,
    closeImportSchedule,
    importManualSchedule,
  };
}
