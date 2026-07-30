"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import { JP_LESSON_CACHE_KEY as EN_LESSON_CACHE_KEY } from "@/lib/en-api-cache";
import { normalizeClassDurationMinutes as normalizeEnClassDurationMinutes } from "@/lib/en-lesson-shared";
import { JP_LESSON_CACHE_KEY } from "@/lib/jp-api-cache";
import { writeClientCache } from "@/lib/client-swr-cache";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { normalizeClassDurationMinutes } from "@/lib/jp-lesson-shared";
import { syncJpLessonManualScheduleCache } from "@/lib/jp-lesson-manual-schedule-cache";
import {
  createJpLessonManualSchedule,
  deleteJpLessonManualSchedule,
  updateJpLessonManualSchedule,
  type JpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule";
import { findLessonTeacherByPickerName } from "@/lib/lesson-teacher-search";
import { sortJpLessonTeachersByLessonCount } from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
} from "@/lib/jp-lesson-teachers-cache";
import {
  syncManualScheduleLinkedLessonErrorMessage,
  syncManualScheduleLinkedLessonToLearning,
} from "@/lib/manual-schedule-sync-linked-lesson";
import type {
  EnLessonClassScheduleInput,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
  JpLessonClassScheduleInput,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
  KoLessonTeacher,
} from "@/lib/types";
import type { JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import {
  type DayScheduleEvent,
  readLessonCache,
  readEnLessonCache,
} from "@/components/jp-lesson-schedule-page/jp-lesson-schedule-page-helpers";
import type { Locale } from "@/i18n/messages";

export type UseJpLessonSchedulePageActionsOptions = {
  locale: Locale;
  isAdmin: boolean;
  lessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  refs: Record<string, JpVocabRef>;
  enRefs: Record<string, EnVocabRef>;
  teachers: JpLessonTeacher[];
  enTeachers: EnLessonTeacher[];
  koTeachers: KoLessonTeacher[];
  editingManual: JpLessonManualSchedule | null;
  selectedManualSchedule: JpLessonManualSchedule | null;
  selectedEvent: DayScheduleEvent | null;
  lessonById: Map<number, JpLessonRecord>;
  enLessonById: Map<number, EnLessonRecord>;
  savingNextClassId: number | null;
  savingManualScheduleRef: MutableRefObject<boolean>;
  savingNextClassRef: MutableRefObject<number | null>;
  // export helpers stay on page
  setManualModalMode: Dispatch<SetStateAction<"full" | "time">>;
  setEditingManual: Dispatch<SetStateAction<JpLessonManualSchedule | null>>;
  setManualModalOpen: Dispatch<SetStateAction<boolean>>;
  setSavingManualSchedule: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setManualSchedules: Dispatch<SetStateAction<JpLessonManualSchedule[]>>;
  setSelectedEventKey: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  setTeachers: Dispatch<SetStateAction<JpLessonTeacher[]>>;
  setEnTeachers: Dispatch<SetStateAction<EnLessonTeacher[]>>;
  setKoTeachers: Dispatch<SetStateAction<KoLessonTeacher[]>>;
  setLessons: Dispatch<SetStateAction<JpLessonRecord[]>>;
  setEnLessons: Dispatch<SetStateAction<EnLessonRecord[]>>;
  setSavingNextClassId: Dispatch<SetStateAction<number | null>>;
  setEditingNextClassLesson: Dispatch<SetStateAction<JpLessonRecord | null>>;
  setEditingEnNextClassLesson: Dispatch<SetStateAction<EnLessonRecord | null>>;
  loadLessons: (opts?: { force?: boolean }) => Promise<void>;
  loadEnLessons: (opts?: { force?: boolean }) => Promise<void>;
};

export function useJpLessonSchedulePageActions(options: UseJpLessonSchedulePageActionsOptions) {
  const {
    locale,
    isAdmin,
    lessons,
    enLessons,
    refs,
    enRefs,
    teachers,
    enTeachers,
    koTeachers,
    editingManual,
    selectedManualSchedule,
    selectedEvent,
    lessonById,
    enLessonById,
    savingNextClassId,
    savingManualScheduleRef,
    savingNextClassRef,

    setManualModalMode,
    setEditingManual,
    setManualModalOpen,
    setSavingManualSchedule,
    setError,
    setManualSchedules,
    setSelectedEventKey,
    setStatusMessage,
    setTeachers,
    setEnTeachers,
    setKoTeachers,
    setLessons,
    setEnLessons,
    setSavingNextClassId,
    setEditingNextClassLesson,
    setEditingEnNextClassLesson,
    loadLessons,
    loadEnLessons,
  } = options;

  const applyLinkedLessonSynced = (
    subject: "jp" | "en",
    lesson: JpLessonRecord | EnLessonRecord
  ) => {
    if (subject === "jp") {
      setLessons((prev) => {
        const next = prev.map((item) =>
          item.id === lesson.id ? (lesson as JpLessonRecord) : item
        );
        const cache = readLessonCache();
        if (cache) {
          writeClientCache(JP_LESSON_CACHE_KEY, {
            ...cache,
            lessons: next,
          });
        }
        return next;
      });
      return;
    }
    setEnLessons((prev) => {
      const next = prev.map((item) =>
        item.id === lesson.id ? (lesson as EnLessonRecord) : item
      );
      const cache = readEnLessonCache();
      if (cache) {
        writeClientCache(EN_LESSON_CACHE_KEY, {
          ...cache,
          lessons: next,
        });
      }
      return next;
    });
  };

  const openManualModal = (
    manual: JpLessonManualSchedule | null = null,
    mode: "full" | "time" = "full"
  ) => {
    setManualModalMode(mode);
    setEditingManual(manual);
    setManualModalOpen(true);
  };

  const closeManualModal = () => {
    setManualModalOpen(false);
    setEditingManual(null);
    setManualModalMode("full");
  };

  const handleSaveManualSchedule = async (
    draft: Parameters<typeof createJpLessonManualSchedule>[0]
  ) => {
    if (savingManualScheduleRef.current) {
      setStatusMessage("正在提交，请勿重复提交");
      window.setTimeout(() => setStatusMessage(""), 2500);
      return;
    }
    savingManualScheduleRef.current = true;
    setSavingManualSchedule(true);
    setError("");
    const isEditing = editingManual != null;
    try {
      const saved = isEditing
        ? await updateJpLessonManualSchedule(editingManual.id, draft)
        : await createJpLessonManualSchedule(draft);
      if (!saved) {
        setError("保存手动日程失败");
        return;
      }
      setManualSchedules((prev) => {
        const next = isEditing
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved];
        const sorted = next.sort((a, b) => a.class_at.localeCompare(b.class_at));
        syncJpLessonManualScheduleCache(sorted);
        return sorted;
      });

      // 保存后再对齐一次：关联教材 → 学习中 + 时间/老师（防选后改过时间）
      const linked = saved.linked_lessons || [];
      if (isAdmin && linked.length > 0) {
        let syncFailed = "";
        let syncedJp = false;
        let syncedEn = false;
        for (const link of linked) {
          const teachersForSubject =
            link.subject === "en" ? enTeachers : teachers;
          const result = await syncManualScheduleLinkedLessonToLearning({
            subject: link.subject,
            lessonId: link.lesson_id,
            classAt: saved.class_at,
            durationMinutes: saved.duration_minutes,
            teacherName: saved.teacher,
            teachers: teachersForSubject,
            locale,
          });
          if (!result.ok) {
            syncFailed = syncManualScheduleLinkedLessonErrorMessage(result.error);
            break;
          }
          applyLinkedLessonSynced(link.subject, result.lesson);
          if (link.subject === "jp") syncedJp = true;
          else syncedEn = true;
        }
        if (syncFailed) {
          setStatusMessage(
            (isEditing ? "手动日程已保存" : "手动日程已添加") +
              `，但教材同步失败：${syncFailed}`
          );
        } else {
          setStatusMessage(
            isEditing
              ? "手动日程已保存，教材已同步为学习中"
              : "手动日程已添加，教材已同步为学习中"
          );
          if (syncedJp) void loadLessons({ force: true });
          if (syncedEn) void loadEnLessons({ force: true });
        }
      } else {
        setStatusMessage(isEditing ? "手动日程已保存" : "手动日程已添加");
      }

      setSelectedEventKey(`manual-${saved.id}`);
      closeManualModal();
      window.setTimeout(() => setStatusMessage(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingManualScheduleRef.current = false;
      setSavingManualSchedule(false);
    }
  };

  const handleDeleteManualSchedule = async () => {
    if (!selectedManualSchedule) return;
    if (!window.confirm("确定删除这条手动日程吗？")) return;
    setError("");
    try {
      await deleteJpLessonManualSchedule(selectedManualSchedule.id);
      setManualSchedules((prev) => {
        const next = prev.filter((item) => item.id !== selectedManualSchedule.id);
        syncJpLessonManualScheduleCache(next);
        return next;
      });
      setSelectedEventKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
        if (data.error === "name_duplicate") {
          return (
            findLessonTeacherByPickerName(teachers, input.name) ??
            teachers.find((item) => item.name.trim() === input.name.trim()) ??
            null
          );
        }
        return null;
      }
      if (data.user_account) {
        rememberAdminUserPassword(data.user_account.id, data.user_account.password);
        setStatusMessage(
          `已添加老师，并自动创建禁用账号：${formatAdminUserCredentials(
            data.user_account.username,
            data.user_account.password,
            "zh"
          )}`
        );
        window.setTimeout(() => setStatusMessage(""), 4500);
      }
      setTeachers((prev) => {
        const renamedMap = new Map(
          (data.renamed_teachers ?? []).map((teacher) => [teacher.id, teacher])
        );
        const merged = prev.map((teacher) => renamedMap.get(teacher.id) ?? teacher);
        const next = sortJpLessonTeachersByLessonCount([
          ...merged.filter((teacher) => teacher.id !== data.teacher!.id),
          data.teacher!,
        ]);
        const cache = readLessonCache();
        writeClientCache(JP_LESSON_CACHE_KEY, {
          lessons,
          refs,
          notes: cache?.notes ?? [],
          teachers: next,
        });
        return next;
      });
      return data.teacher;
    } catch {
      return null;
    }
  };

  const addEnLessonTeacher = async (
    input: JpLessonTeacherAddInput
  ): Promise<EnLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/en-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: EnLessonTeacher;
        renamed_teachers?: EnLessonTeacher[];
        error?: string;
      };
      if (!data.ok || !data.teacher) {
        if (data.error === "name_duplicate") {
          return (
            findLessonTeacherByPickerName(enTeachers, input.name) ??
            enTeachers.find((item) => item.name.trim() === input.name.trim()) ??
            null
          );
        }
        return null;
      }
      setEnTeachers((prev) => {
        const renamedMap = new Map(
          (data.renamed_teachers ?? []).map((teacher) => [teacher.id, teacher])
        );
        const merged = prev.map((teacher) => renamedMap.get(teacher.id) ?? teacher);
        const next = sortJpLessonTeachersByLessonCount([
          ...merged.filter((teacher) => teacher.id !== data.teacher!.id),
          data.teacher!,
        ]);
        const cache = readEnLessonCache();
        writeClientCache(EN_LESSON_CACHE_KEY, {
          lessons: enLessons,
          refs: enRefs,
          notes: cache?.notes ?? [],
          teachers: next,
        });
        return next;
      });
      return data.teacher;
    } catch {
      return null;
    }
  };

  const addKoLessonTeacher = async (
    input: JpLessonTeacherAddInput
  ): Promise<KoLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/ko-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: KoLessonTeacher;
        renamed_teachers?: KoLessonTeacher[];
        error?: string;
      };
      if (!data.ok || !data.teacher) {
        if (data.error === "name_duplicate") {
          return (
            findLessonTeacherByPickerName(koTeachers, input.name) ??
            koTeachers.find((item) => item.name.trim() === input.name.trim()) ??
            null
          );
        }
        return null;
      }
      setKoTeachers((prev) => {
        const renamedMap = new Map(
          (data.renamed_teachers ?? []).map((teacher) => [teacher.id, teacher])
        );
        const merged = prev.map((teacher) => renamedMap.get(teacher.id) ?? teacher);
        return sortJpLessonTeachersByLessonCount([
          ...merged.filter((teacher) => teacher.id !== data.teacher!.id),
          data.teacher!,
        ]);
      });
      return data.teacher;
    } catch {
      return null;
    }
  };

  const setLessonClassSchedules = async (
    lessonId: number,
    schedules: JpLessonClassScheduleInput[]
  ) => {
    if (!isAdmin) return;
    if (savingNextClassRef.current === lessonId || savingNextClassId === lessonId) {
      setStatusMessage("正在提交，请勿重复提交");
      window.setTimeout(() => setStatusMessage(""), 2500);
      return;
    }

    const normalized = schedules.map((item) => ({
      class_at: item.class_at.trim(),
      duration_minutes: normalizeClassDurationMinutes(item.duration_minutes),
    }));

    savingNextClassRef.current = lessonId;
    setSavingNextClassId(lessonId);

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
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }
      await loadLessons({ force: true });
      setEditingNextClassLesson(null);
      setStatusMessage("上课时间已更新");
      window.setTimeout(() => setStatusMessage(""), 2500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "保存失败");
      window.setTimeout(() => setStatusMessage(""), 3500);
    } finally {
      savingNextClassRef.current = null;
      setSavingNextClassId(null);
    }
  };

  const setEnLessonClassSchedules = async (
    lessonId: number,
    schedules: EnLessonClassScheduleInput[]
  ) => {
    if (!isAdmin) return;
    if (savingNextClassRef.current === lessonId || savingNextClassId === lessonId) {
      setStatusMessage("正在提交，请勿重复提交");
      window.setTimeout(() => setStatusMessage(""), 2500);
      return;
    }

    const normalized = schedules.map((item) => ({
      class_at: item.class_at.trim(),
      duration_minutes: normalizeEnClassDurationMinutes(item.duration_minutes),
    }));

    savingNextClassRef.current = lessonId;
    setSavingNextClassId(lessonId);

    try {
      const res = await fetch("/api/en-lesson", {
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
        lesson?: EnLessonRecord;
        error?: string;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }
      await loadEnLessons({ force: true });
      setEditingEnNextClassLesson(null);
      setStatusMessage("上课时间已更新");
      window.setTimeout(() => setStatusMessage(""), 2500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "保存失败");
      window.setTimeout(() => setStatusMessage(""), 3500);
    } finally {
      savingNextClassRef.current = null;
      setSavingNextClassId(null);
    }
  };

  const openLessonReschedule = () => {
    if (!selectedEvent?.lessonId) return;
    if (selectedEvent.subject === "en") {
      const lesson = enLessonById.get(selectedEvent.lessonId);
      if (!lesson) return;
      setEditingEnNextClassLesson(lesson);
      return;
    }
    if (selectedEvent.subject !== "jp") return;
    const lesson = lessonById.get(selectedEvent.lessonId);
    if (!lesson) return;
    setTeachers((prev) => mergeJpLessonTeachersCache(prev, readJpLessonTeachersCache()));
    setEditingNextClassLesson(lesson);
  };


  return {
    openManualModal,
    closeManualModal,
    handleSaveManualSchedule,
    handleDeleteManualSchedule,
    addLessonTeacher,
    addEnLessonTeacher,
    addKoLessonTeacher,
    setLessonClassSchedules,
    setEnLessonClassSchedules,
    openLessonReschedule,
    applyLinkedLessonSynced,
  };
}
