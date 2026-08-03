"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { lessonScheduleSaveErrorMessage } from "@/lib/lesson-class-schedule-form";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  formatLessonContentLines,
  getJpLessonProgressStatus,
  jpLessonProgressToFields,
  normalizeClassDurationMinutes,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import {
  adjustJpLessonTeacherLessonCounts,
  normalizeJpLessonTeacher,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import { jpVocabRefApiPath } from "@/lib/jp-vocab-ref-shared";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
  removeJpLessonTeacherCache,
  upsertJpLessonTeacherCache,
} from "@/lib/jp-lesson-teachers-cache";
import type {
  JpLessonClassScheduleInput,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
} from "@/lib/types";
import type { JpLessonTeacherAddInput, JpLessonTeacherUpdateInput } from "@/components/JpLessonTeacherEditModal";
import {
  persistLessonCache,
  teacherAutoEnableStatusSuffix,
  type TeacherAutoEnableInfo,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import {
  JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
  JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL,
  runJpLessonVocabSyncChunks,
  type JpLessonVocabSyncProgress,
} from "@/components/jp-lesson-page/runJpLessonVocabSyncChunks";
import type { JpLessonVocabSyncPlan } from "@/lib/jp-lesson-vocab-sync-shared";
import type { Locale } from "@/i18n/messages";

export type UseJpLessonPageActionsOptions = {
  locale: Locale;
  user: { id: number } | null;
  canOperate: boolean;
  isAdmin: boolean;
  openJpAuth: () => void;
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  noteCounts: Record<number, number>;
  teachers: JpLessonTeacher[];
  savingId: number | null;
  savingTeacherLessonId: number | null;
  savingNextClassId: number | null;
  deletingId: number | null;
  batchLessonIds: number[];
  setLessons: Dispatch<SetStateAction<JpLessonRecord[]>>;
  setRefs: Dispatch<SetStateAction<Record<string, JpVocabRef>>>;
  setNoteCounts: Dispatch<SetStateAction<Record<number, number>>>;
  setTeachers: Dispatch<SetStateAction<JpLessonTeacher[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setSavingId: Dispatch<SetStateAction<number | null>>;
  setSavingTeacherLessonId: Dispatch<SetStateAction<number | null>>;
  setSavingNextClassId: Dispatch<SetStateAction<number | null>>;
  setDeletingId: Dispatch<SetStateAction<number | null>>;
  setEditingTeacherLesson: Dispatch<SetStateAction<JpLessonRecord | null>>;
  setEditingTeacherLessonIds: Dispatch<SetStateAction<number[]>>;
  setEditingNextClassLesson: Dispatch<SetStateAction<JpLessonRecord | null>>;
  setBatchLessonIds: Dispatch<SetStateAction<number[]>>;
  setBatchModalOpen: Dispatch<SetStateAction<boolean>>;
  setBatchSaving: Dispatch<SetStateAction<boolean>>;
  setAnnotatingLesson: Dispatch<
    SetStateAction<{
      lesson: JpLessonRecord;
      ref: JpVocabRef;
      imageUrl: string;
      mediaType?: "image" | "pdf";
    } | null>
  >;
  setVocabSyncProgress: Dispatch<SetStateAction<JpLessonVocabSyncProgress | null>>;
  loadLessons: (opts?: { force?: boolean }) => Promise<void>;
};

export function useJpLessonPageActions(options: UseJpLessonPageActionsOptions) {
  const {
    locale,
    user,
    canOperate,
    isAdmin,
    openJpAuth,
    lessons,
    refs,
    noteCounts,
    teachers,
    savingId,
    savingTeacherLessonId,
    savingNextClassId,
    deletingId,
    batchLessonIds,
    setLessons,
    setRefs,
    setNoteCounts,
    setTeachers,
    setStatus,
    setSavingId,
    setSavingTeacherLessonId,
    setSavingNextClassId,
    setDeletingId,
    setEditingTeacherLesson,
    setEditingTeacherLessonIds,
    setEditingNextClassLesson,
    setBatchLessonIds,
    setBatchModalOpen,
    setBatchSaving,
    setAnnotatingLesson,
    setVocabSyncProgress,
    loadLessons,
  } = options;

  const syncLessonVocabIfNeeded = async (
    lessonId: number,
    vocabSync: JpLessonVocabSyncPlan | null | undefined
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!vocabSync?.needed || !vocabSync.total) {
      return { ok: true };
    }
    return runJpLessonVocabSyncChunks({
      locale,
      lessonId,
      plan: vocabSync,
      onProgress: setVocabSyncProgress,
    });
  };

  const applyLessonServerPatch = (
    server: JpLessonRecord,
    fallback?: JpLessonRecord
  ) => {
    setLessons((prev) => {
      const next = prev.map((l) => {
        if (l.id !== server.id) return l;
        const base = fallback && fallback.id === server.id ? fallback : l;
        return {
          ...server,
          teacher_ids: server.teacher_ids?.length
            ? server.teacher_ids
            : (base.teacher_ids ?? []),
          teacher_other: server.teacher_other ?? base.teacher_other,
          class_schedules: server.class_schedules?.length
            ? server.class_schedules
            : base.class_schedules,
          next_class_at: server.next_class_at ?? base.next_class_at,
          class_duration_minutes:
            server.class_duration_minutes ?? base.class_duration_minutes,
        };
      });
      persistLessonCache(next, refs, noteCounts, teachers);
      return next;
    });
  };

  const revertLessonProgress = async (
    lessonId: number,
    previousStatus: JpLessonProgressStatus
  ) => {
    try {
      await fetch("/api/jp-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          lesson_id: lessonId,
          progress_status: previousStatus,
        }),
      });
    } catch {
      // 回滚失败时仍靠本地 snapshot 展示；下次刷新以服务端为准
    }
  };

  const setLessonProgress = async (
    lessonId: number,
    progressStatus: JpLessonProgressStatus
  ) => {
    if (!canOperate) {
      if (!user) openJpAuth();
      else setStatus("您没有日语新课的编辑权限。");
      return;
    }
    if (savingId === lessonId) return;

    const snapshot = lessons.find((l) => l.id === lessonId);
    const previousStatus = snapshot
      ? getJpLessonProgressStatus(snapshot)
      : "pending";
    const markingCompleted = progressStatus === "completed";

    setSavingId(lessonId);
    setStatus("");

    if (markingCompleted) {
      // 标已完成：先不改下拉状态，进度条「正在执行操作…」，成功后再切到已完成
      setVocabSyncProgress({
        lessonId,
        synced: 0,
        total: 0,
        percent: 6,
        label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
      });
    } else {
      const optimistic = jpLessonProgressToFields(progressStatus);
      // 立刻写共享缓存：日程认「学习中/已完成」，点选后打开日程必须马上生效
      setLessons((prev) => {
        const next = prev.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                completed: optimistic.completed,
                learning: optimistic.learning,
              }
            : l
        );
        persistLessonCache(next, refs, noteCounts, teachers);
        return next;
      });
    }

    try {
      const res = await fetch("/api/jp-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ lesson_id: lessonId, progress_status: progressStatus }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lesson?: JpLessonRecord;
        error?: string;
        teacher_auto_enable?: TeacherAutoEnableInfo | null;
        vocab_sync?: JpLessonVocabSyncPlan | null;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }

      if (markingCompleted) {
        setVocabSyncProgress({
          lessonId,
          synced: 0,
          total: data.vocab_sync?.total ?? 0,
          percent: 12,
          label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
        });
        const syncResult = await syncLessonVocabIfNeeded(
          lessonId,
          data.vocab_sync
        );
        if (!syncResult.ok) {
          await revertLessonProgress(lessonId, previousStatus);
          if (snapshot) {
            setLessons((prev) => {
              const next = prev.map((l) => (l.id === lessonId ? snapshot : l));
              persistLessonCache(next, refs, noteCounts, teachers);
              return next;
            });
          }
          setVocabSyncProgress(null);
          setStatus(syncResult.error);
          return;
        }
        applyLessonServerPatch(data.lesson, snapshot);
        setVocabSyncProgress({
          lessonId,
          synced: data.vocab_sync?.total ?? 0,
          total: data.vocab_sync?.total ?? 0,
          percent: 100,
          label: JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL,
        });
        const autoEnableSuffix = teacherAutoEnableStatusSuffix(
          data.teacher_auto_enable
        );
        setStatus(
          autoEnableSuffix
            ? `${JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL}${autoEnableSuffix}`
            : JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL
        );
        window.setTimeout(() => {
          setVocabSyncProgress(null);
          setStatus("");
        }, 2200);
        return;
      }

      applyLessonServerPatch(data.lesson, snapshot);
      const autoEnableSuffix = teacherAutoEnableStatusSuffix(
        data.teacher_auto_enable
      );
      if (autoEnableSuffix) {
        setStatus(`学习状态已更新${autoEnableSuffix}`);
        window.setTimeout(() => setStatus(""), 4000);
      }
    } catch (err) {
      if (snapshot) {
        setLessons((prev) => {
          const next = prev.map((l) => (l.id === lessonId ? snapshot : l));
          persistLessonCache(next, refs, noteCounts, teachers);
          return next;
        });
      }
      setVocabSyncProgress(null);
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const setLessonTeachers = async (
    lessonId: number,
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates: JpLessonTeacherUpdateInput[] = [],
    options?: { keepOpen?: boolean }
  ) => {
    if (!isAdmin || savingTeacherLessonId === lessonId) return;

    setSavingTeacherLessonId(lessonId);

    const prevTeacherIds = lessons.find((l) => l.id === lessonId)?.teacher_ids ?? [];

    try {
      // 新增老师会先 upsert 到 localStorage；此处合并缓存，避免保存关联时用旧列表覆盖导致只显示 #id
      let nextTeachers = mergeJpLessonTeachersCache(
        teachers,
        readJpLessonTeachersCache()
      );
      for (const input of teacherUpdates) {
        const res = await fetch("/api/admin/jp-lesson-teachers", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: input.id,
            name: input.name,
            hourly_rate: input.hourly_rate,
            lesson_minutes: input.lesson_minutes,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          teacher?: JpLessonTeacher;
          error?: string;
        };
        if (!data.ok || !data.teacher) {
          throw new Error(data.error || "保存老师信息失败");
        }
        const teacher = normalizeJpLessonTeacher(data.teacher);
        upsertJpLessonTeacherCache(teacher);
        nextTeachers = sortJpLessonTeachersByLessonCount(
          nextTeachers.map((t) => (t.id === teacher.id ? teacher : t))
        );
      }

      const res = await fetch("/api/jp-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "set_teacher",
          lesson_id: lessonId,
          teacher_ids: teacherIds,
          teacher_other: teacherOther,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lesson?: JpLessonRecord;
        error?: string;
        teacher_auto_enable?: TeacherAutoEnableInfo | null;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }

      nextTeachers = sortJpLessonTeachersByLessonCount(
        adjustJpLessonTeacherLessonCounts(nextTeachers, prevTeacherIds, teacherIds)
      );
      setTeachers(nextTeachers);
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== data.lesson!.id) return l;
          const server = data.lesson!;
          return {
            ...server,
            teacher_ids: server.teacher_ids?.length
              ? server.teacher_ids
              : teacherIds,
            teacher_other: server.teacher_other ?? teacherOther,
            class_schedules: server.class_schedules?.length
              ? server.class_schedules
              : l.class_schedules,
            next_class_at: server.next_class_at ?? l.next_class_at,
            class_duration_minutes:
              server.class_duration_minutes ?? l.class_duration_minutes,
          };
        });
        persistLessonCache(next, refs, noteCounts, nextTeachers);
        return next;
      });

      if (!options?.keepOpen) {
        blurActiveElementForLessonModalClose();
        setEditingTeacherLesson(null);
        scrollLessonListItemIntoView(lessonId);
      }
      setStatus(
        `上课老师已更新${teacherAutoEnableStatusSuffix(data.teacher_auto_enable)}`
      );
      window.setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setStatus(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSavingTeacherLessonId(null);
    }
  };

  const setLessonTeachersForMany = async (
    lessonIds: number[],
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates: JpLessonTeacherUpdateInput[] = [],
    options?: { keepOpen?: boolean }
  ) => {
    const normalizedLessonIds = lessonIds.filter(
      (id, index, arr) => Number.isInteger(id) && id > 0 && arr.indexOf(id) === index
    );
    if (!normalizedLessonIds.length) return;

    for (let index = 0; index < normalizedLessonIds.length; index += 1) {
      await setLessonTeachers(
        normalizedLessonIds[index],
        teacherIds,
        teacherOther,
        index === 0 ? teacherUpdates : [],
        { keepOpen: true }
      );
    }

    if (!options?.keepOpen) {
      blurActiveElementForLessonModalClose();
      setEditingTeacherLesson(null);
      setEditingTeacherLessonIds([]);
      scrollLessonListItemIntoView(normalizedLessonIds[0]);
    }
    setStatus(`已更新 ${normalizedLessonIds.length} 条课程的上课老师`);
    window.setTimeout(() => setStatus(""), 2500);
  };

  const addLessonTeacher = async (
    input: JpLessonTeacherAddInput
  ): Promise<JpLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: JpLessonTeacher;
        renamed_teachers?: JpLessonTeacher[];
        error?: string;
        user_account?: {
          id: number;
          username: string;
          password: string;
          disabled: boolean;
        };
      };
      if (!data.ok || !data.teacher) {
        return null;
      }
      const teacher = normalizeJpLessonTeacher(data.teacher);
      const renamedTeachers = (data.renamed_teachers ?? []).map((item) =>
        normalizeJpLessonTeacher(item)
      );
      if (data.user_account) {
        rememberAdminUserPassword(data.user_account.id, data.user_account.password);
        setStatus(
          `已添加老师，并自动创建禁用账号：${formatAdminUserCredentials(
            data.user_account.username,
            data.user_account.password,
            "zh",
            "jp_vocab"
          )}`
        );
      }
      for (const item of renamedTeachers) {
        upsertJpLessonTeacherCache(item);
      }
      upsertJpLessonTeacherCache(teacher);
      const mergedTeachers = mergeJpLessonTeachersCache(
        [teacher, ...renamedTeachers],
        readJpLessonTeachersCache()
      );
      setTeachers((prev) => mergeJpLessonTeachersCache(prev, mergedTeachers));
      void loadLessons({ force: true });
      return teacher;
    } catch {
      return null;
    }
  };

  const updateLessonTeacher = async (
    input: JpLessonTeacherUpdateInput
  ): Promise<JpLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: input.id,
          name: input.name,
          hourly_rate: input.hourly_rate,
          lesson_minutes: input.lesson_minutes,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: JpLessonTeacher;
        error?: string;
      };
      if (!data.ok || !data.teacher) {
        return null;
      }
      const teacher = normalizeJpLessonTeacher(data.teacher);
      upsertJpLessonTeacherCache(teacher);
      await loadLessons({ force: true });
      return teacher;
    } catch {
      return null;
    }
  };

  const deleteLessonTeacher = async (id: number, name: string): Promise<boolean> => {
    if (!isAdmin) return false;
    try {
      const res = await fetch(`/api/admin/jp-lesson-teachers?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || "删除失败");
        return false;
      }
      removeJpLessonTeacherCache(id);
      await loadLessons({ force: true });
      setStatus(`已删除老师：${name}`);
      window.setTimeout(() => setStatus(""), 2500);
      return true;
    } catch {
      setStatus("删除失败");
      return false;
    }
  };

  const setLessonClassSchedules = async (
    lessonId: number,
    schedules: JpLessonClassScheduleInput[]
  ) => {
    if (!isAdmin || savingNextClassId === lessonId) return;

    const normalized = schedules.map((item) => ({
      class_at: item.class_at.trim(),
      duration_minutes: normalizeClassDurationMinutes(item.duration_minutes),
    }));
    const snapshot = lessons.find((l) => l.id === lessonId);
    const first = normalized[0];

    setSavingNextClassId(lessonId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              class_schedules: normalized.map((item, index) => ({
                id: -(index + 1),
                class_at: item.class_at,
                duration_minutes: item.duration_minutes,
              })),
              next_class_at: first?.class_at ?? null,
              class_duration_minutes: first?.duration_minutes ?? null,
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
          action: "set_class_schedules",
          lesson_id: lessonId,
          class_schedules: normalized,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lesson?: JpLessonRecord;
        error?: string;
        teacher_auto_enable?: TeacherAutoEnableInfo | null;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(lessonScheduleSaveErrorMessage(data.error));
      }
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== data.lesson!.id) return l;
          const server = data.lesson!;
          return {
            ...server,
            teacher_ids: server.teacher_ids?.length
              ? server.teacher_ids
              : l.teacher_ids,
            teacher_other: server.teacher_other ?? l.teacher_other,
            class_schedules: server.class_schedules?.length
              ? server.class_schedules
              : l.class_schedules,
            next_class_at: server.next_class_at ?? l.next_class_at,
            class_duration_minutes:
              server.class_duration_minutes ?? l.class_duration_minutes,
          };
        });
        persistLessonCache(next, refs, noteCounts, teachers);
        return next;
      });
      blurActiveElementForLessonModalClose();
      setEditingNextClassLesson(null);
      scrollLessonListItemIntoView(lessonId);
      setStatus(
        `上课时间已更新${teacherAutoEnableStatusSuffix(data.teacher_auto_enable)}`
      );
      window.setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      if (snapshot) {
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonId ? snapshot : l))
        );
      }
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingNextClassId(null);
    }
  };

  const setBatchClassSchedulesAndTeachers = async (
    schedules: JpLessonClassScheduleInput[],
    teacherIds: number[],
    teacherOther: string | null,
    progressStatus: JpLessonProgressStatus | null
  ) => {
    if (!isAdmin || !batchLessonIds.length) return;
    const normalized = schedules.map((item) => ({
      class_at: item.class_at.trim(),
      duration_minutes: normalizeClassDurationMinutes(item.duration_minutes),
    }));
    const snapshotById = new Map(
      lessons
        .filter((lesson) => batchLessonIds.includes(lesson.id))
        .map((lesson) => [lesson.id, lesson] as const)
    );
    setBatchSaving(true);
    try {
      const autoEnabledUsernames: string[] = [];
      for (const lessonId of batchLessonIds) {
        const timeRes = await fetch("/api/jp-lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({
            action: "set_class_schedules",
            lesson_id: lessonId,
            class_schedules: normalized,
          }),
        });
        const timeData = (await timeRes.json()) as {
          ok: boolean;
          error?: string;
          teacher_auto_enable?: TeacherAutoEnableInfo | null;
        };
        if (!timeData.ok) throw new Error(timeData.error || `课程 #${lessonId} 时间保存失败`);
        for (const row of timeData.teacher_auto_enable?.enabled ?? []) {
          const name = String(row.username ?? "").trim();
          if (name) autoEnabledUsernames.push(name);
        }

        const teacherRes = await fetch("/api/jp-lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({
            action: "set_teacher",
            lesson_id: lessonId,
            teacher_ids: teacherIds,
            teacher_other: teacherOther,
          }),
        });
        const teacherData = (await teacherRes.json()) as {
          ok: boolean;
          error?: string;
          teacher_auto_enable?: TeacherAutoEnableInfo | null;
        };
        if (!teacherData.ok) throw new Error(teacherData.error || `课程 #${lessonId} 老师保存失败`);
        for (const row of teacherData.teacher_auto_enable?.enabled ?? []) {
          const name = String(row.username ?? "").trim();
          if (name) autoEnabledUsernames.push(name);
        }

        if (progressStatus) {
          const progressRes = await fetch("/api/jp-lesson", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({
              lesson_id: lessonId,
              progress_status: progressStatus,
            }),
          });
          const progressData = (await progressRes.json()) as {
            ok: boolean;
            error?: string;
            teacher_auto_enable?: TeacherAutoEnableInfo | null;
            vocab_sync?: JpLessonVocabSyncPlan | null;
          };
          if (!progressData.ok) {
            throw new Error(progressData.error || `课程 #${lessonId} 状态保存失败`);
          }
          for (const row of progressData.teacher_auto_enable?.enabled ?? []) {
            const name = String(row.username ?? "").trim();
            if (name) autoEnabledUsernames.push(name);
          }
          if (progressStatus === "completed") {
            setVocabSyncProgress({
              lessonId,
              synced: 0,
              total: progressData.vocab_sync?.total ?? 0,
              percent: 10,
              label: JP_LESSON_COMPLETE_PROGRESS_BUSY_LABEL,
            });
            const syncResult = await syncLessonVocabIfNeeded(
              lessonId,
              progressData.vocab_sync
            );
            if (!syncResult.ok) {
              const snap = snapshotById.get(lessonId);
              const previousStatus = snap
                ? getJpLessonProgressStatus(snap)
                : "pending";
              await revertLessonProgress(lessonId, previousStatus);
              throw new Error(syncResult.error);
            }
            setVocabSyncProgress({
              lessonId,
              synced: progressData.vocab_sync?.total ?? 0,
              total: progressData.vocab_sync?.total ?? 0,
              percent: 100,
              label: JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL,
            });
          }
        }
      }

      const first = normalized[0];
      const progressFields = progressStatus
        ? jpLessonProgressToFields(progressStatus)
        : null;
      setLessons((prev) => {
        const next = prev.map((lesson) => {
          if (!batchLessonIds.includes(lesson.id)) return lesson;
          return {
            ...lesson,
            teacher_ids: teacherIds,
            teacher_other: teacherOther,
            class_schedules: normalized.map((item, index) => ({
              id: -(index + 1),
              class_at: item.class_at,
              duration_minutes: item.duration_minutes,
            })),
            next_class_at: first?.class_at ?? null,
            class_duration_minutes: first?.duration_minutes ?? null,
            completed: progressFields?.completed ?? lesson.completed,
            learning: progressFields?.learning ?? lesson.learning,
          };
        });
        persistLessonCache(next, refs, noteCounts, teachers);
        return next;
      });
      const autoEnableSuffix = teacherAutoEnableStatusSuffix({
        enabled: autoEnabledUsernames.map((username) => ({ username })),
      });
      setStatus(
        progressStatus === "completed"
          ? `${JP_LESSON_COMPLETE_PROGRESS_DONE_LABEL}（已批量更新 ${batchLessonIds.length} 条）`
          : `已批量更新 ${batchLessonIds.length} 条未上课教案${autoEnableSuffix}`
      );
      const firstBatchId = batchLessonIds[0];
      blurActiveElementForLessonModalClose();
      setBatchLessonIds([]);
      setBatchModalOpen(false);
      if (firstBatchId != null) scrollLessonListItemIntoView(firstBatchId);
      window.setTimeout(() => {
        setStatus("");
        setVocabSyncProgress(null);
      }, 2200);
    } catch (err) {
      if (snapshotById.size) {
        setLessons((prev) =>
          prev.map((lesson) => snapshotById.get(lesson.id) ?? lesson)
        );
      }
      setStatus(err instanceof Error ? err.message : "批量保存失败");
    } finally {
      setBatchSaving(false);
    }
  };

  const handleRefUpdated = (ref: JpVocabRef, lesson: JpLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, noteCounts, teachers);
    setStatus("教案已更新，仅影响本条新课。");
    window.setTimeout(() => setStatus(""), 2500);
  };

  const handleAnnotateSaved = (ref: JpVocabRef, lesson: JpLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, noteCounts, teachers);
    setAnnotatingLesson((prev) => {
      if (!prev || prev.lesson.id !== lesson.id) return prev;
      const imageUrl = jpVocabRefApiPath(ref.ref_key, { v: ref.updated_at });
      return {
        lesson,
        ref,
        imageUrl,
        mediaType: ref.media_type === "pdf" ? "pdf" : "image",
      };
    });
  };

  const deleteLesson = async (
    lesson: JpLessonRecord,
    options?: { skipConfirm?: boolean }
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!canOperate) {
      if (!user) openJpAuth();
      else setStatus("您没有日语新课的编辑权限。");
      return { ok: false, error: "无操作权限" };
    }
    if (deletingId === lesson.id) {
      return { ok: false, error: "正在删除中，请稍候" };
    }

    if (!options?.skipConfirm) {
      const preview = formatLessonContentLines(lesson.content, 5).join(" / ");
      const ok = window.confirm(
        `确定删除新课 #${lesson.id}（${preview}）？此操作不可恢复。`
      );
      if (!ok) return { ok: false, error: "cancelled" };
    }

    setDeletingId(lesson.id);
    setStatus("");
    try {
      const res = await fetch("/api/jp-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ action: "delete", lesson_id: lesson.id }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        throw new Error(data.error || "删除失败");
      }

      const nextNoteCounts = { ...noteCounts };
      delete nextNoteCounts[lesson.id];
      setLessons((prev) => {
        const next = prev.filter((l) => l.id !== lesson.id);
        persistLessonCache(next, refs, nextNoteCounts, teachers);
        return next;
      });
      setNoteCounts(nextNoteCounts);
      setBatchLessonIds((prev) => prev.filter((id) => id !== lesson.id));
      setStatus(`已删除新课 #${lesson.id}`);
      window.setTimeout(() => setStatus(""), 2500);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setStatus(message);
      return { ok: false, error: message };
    } finally {
      setDeletingId(null);
    }
  };

  return {
    setLessonProgress,
    setLessonTeachers,
    setLessonTeachersForMany,
    addLessonTeacher,
    updateLessonTeacher,
    deleteLessonTeacher,
    setLessonClassSchedules,
    setBatchClassSchedulesAndTeachers,
    handleRefUpdated,
    handleAnnotateSaved,
    deleteLesson,
  };
}
