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
  linkedLessonKey,
  MANUAL_SCHEDULE_LINKED_LESSONS_MAX,
  normalizeManualScheduleLinkedLessons,
  type ManualScheduleLessonOption,
} from "@/lib/jp-lesson-manual-schedule-linked";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import {
  syncManualScheduleLinkedLessonErrorMessage,
  syncManualScheduleLinkedLessonToLearning,
} from "@/lib/manual-schedule-sync-linked-lesson";
import {
  animateJpVocabSaveProgressTo100,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
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
  setLinkLessonPickOpen: Dispatch<SetStateAction<boolean>>;
  setLinkingManualLesson: Dispatch<SetStateAction<boolean>>;
  setLinkLessonProgressPercent: Dispatch<SetStateAction<number | null>>;
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
  loadManualSchedules: (opts?: { force?: boolean }) => Promise<void>;
  linkingManualLessonRef: MutableRefObject<boolean>;
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
    linkingManualLessonRef,

    setManualModalMode,
    setEditingManual,
    setManualModalOpen,
    setLinkLessonPickOpen,
    setLinkingManualLesson,
    setLinkLessonProgressPercent,
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
    loadManualSchedules,
  } = options;

  const mergeEnsuredTeacherIntoSubjectList = (
    subject: "jp" | "en",
    teacher: JpLessonTeacher | EnLessonTeacher | undefined
  ) => {
    if (!teacher) return;
    if (subject === "jp") {
      setTeachers((prev) => {
        if (prev.some((item) => item.id === teacher.id)) {
          return prev.map((item) =>
            item.id === teacher.id ? (teacher as JpLessonTeacher) : item
          );
        }
        const next = sortJpLessonTeachersByLessonCount([
          ...prev,
          teacher as JpLessonTeacher,
        ]);
        const cache = readLessonCache();
        writeClientCache(JP_LESSON_CACHE_KEY, {
          lessons,
          refs,
          notes: cache?.notes ?? [],
          note_counts: cache?.note_counts ?? {},
          teachers: next,
        });
        return next;
      });
      return;
    }
    setEnTeachers((prev) => {
      if (prev.some((item) => item.id === teacher.id)) {
        return prev.map((item) =>
          item.id === teacher.id ? (teacher as EnLessonTeacher) : item
        );
      }
      const next = sortJpLessonTeachersByLessonCount([
        ...prev,
        teacher as EnLessonTeacher,
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
  };

  const applyLinkedLessonSynced = (
    subject: "jp" | "en",
    lesson: JpLessonRecord | EnLessonRecord,
    ensuredTeacher?: JpLessonTeacher | EnLessonTeacher
  ) => {
    mergeEnsuredTeacherIntoSubjectList(subject, ensuredTeacher);
    if (subject === "jp") {
      setLessons((prev) => {
        const next = prev.map((item) =>
          item.id === lesson.id ? (lesson as JpLessonRecord) : item
        );
        const cache = readLessonCache();
        writeClientCache(JP_LESSON_CACHE_KEY, {
          lessons: next,
          refs: cache?.refs ?? {},
          notes: [],
          note_counts: cache?.note_counts ?? {},
          teachers: cache?.teachers,
        });
        return next;
      });
      return;
    }
    setEnLessons((prev) => {
      const next = prev.map((item) =>
        item.id === lesson.id ? (lesson as EnLessonRecord) : item
      );
      const cache = readEnLessonCache();
      writeClientCache(EN_LESSON_CACHE_KEY, {
        lessons: next,
        refs: cache?.refs ?? {},
        notes: cache?.notes ?? [],
        teachers: cache?.teachers,
      });
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

  const openLinkLessonPick = () => {
    if (!selectedManualSchedule) return;
    if (linkingManualLessonRef.current || savingManualScheduleRef.current) return;
    const linkedCount = selectedManualSchedule.linked_lessons?.length ?? 0;
    if (linkedCount >= MANUAL_SCHEDULE_LINKED_LESSONS_MAX) {
      setStatusMessage("已关联 2 本教材");
      window.setTimeout(() => setStatusMessage(""), 2500);
      return;
    }
    if (detectScheduleTeacherSubjectFromTitle(selectedManualSchedule.title) === "ko") {
      setStatusMessage("韩语日程暂无新课教材可关联");
      window.setTimeout(() => setStatusMessage(""), 2500);
      return;
    }
    setLinkLessonPickOpen(true);
  };

  const closeLinkLessonPick = () => {
    if (linkingManualLessonRef.current) return;
    setLinkLessonPickOpen(false);
  };

  const handleLinkLessonFromDetail = async (option: ManualScheduleLessonOption) => {
    const manual = selectedManualSchedule;
    if (!manual || linkingManualLessonRef.current || savingManualScheduleRef.current) {
      return;
    }
    const key = linkedLessonKey({
      subject: option.subject,
      lesson_id: option.id,
    });
    const existing = normalizeManualScheduleLinkedLessons(manual.linked_lessons);
    if (existing.some((link) => linkedLessonKey(link) === key)) {
      setLinkLessonPickOpen(false);
      return;
    }
    if (existing.length >= MANUAL_SCHEDULE_LINKED_LESSONS_MAX) {
      setStatusMessage("已关联 2 本教材");
      window.setTimeout(() => setStatusMessage(""), 2500);
      setLinkLessonPickOpen(false);
      return;
    }

    const nextLinks = normalizeManualScheduleLinkedLessons([
      ...existing,
      { subject: option.subject, lesson_id: option.id },
    ]);

    linkingManualLessonRef.current = true;
    setLinkingManualLesson(true);
    setLinkLessonPickOpen(false);
    setError("");
    setLinkLessonProgressPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setLinkLessonProgressPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 120);

    try {
      const teachersForSubject = option.subject === "en" ? enTeachers : teachers;
      const linkedLesson =
        option.subject === "en"
          ? enLessonById.get(option.id)
          : lessonById.get(option.id);
      const existingSchedules = (linkedLesson?.class_schedules ?? []).map(
        (row) => ({
          class_at: row.class_at,
          duration_minutes: row.duration_minutes,
        })
      );
      const syncResult = await syncManualScheduleLinkedLessonToLearning({
        subject: option.subject,
        lessonId: option.id,
        classAt: manual.class_at,
        durationMinutes: manual.duration_minutes,
        teacherName: manual.teacher,
        teachers: teachersForSubject,
        locale,
        existingSchedules,
      });
      if (!syncResult.ok) {
        throw new Error(syncManualScheduleLinkedLessonErrorMessage(syncResult.error));
      }
      applyLinkedLessonSynced(
        option.subject,
        syncResult.lesson,
        syncResult.ensuredTeacher
      );

      const saved = await updateJpLessonManualSchedule(manual.id, {
        title: manual.title,
        class_at: manual.class_at,
        duration_minutes: manual.duration_minutes,
        teacher: manual.teacher,
        note: manual.note,
        linked_lessons: nextLinks,
      });
      if (!saved) {
        throw new Error("保存关联教材失败");
      }
      setManualSchedules((prev) => {
        const next = prev.map((item) => (item.id === saved.id ? saved : item));
        const sorted = next.sort((a, b) => a.class_at.localeCompare(b.class_at));
        syncJpLessonManualScheduleCache(sorted);
        return sorted;
      });
      setSelectedEventKey(`manual-${saved.id}`);
      if (option.subject === "jp") void loadLessons({ force: true });
      else void loadEnLessons({ force: true });

      await animateJpVocabSaveProgressTo100(startedAt, setLinkLessonProgressPercent);
      setStatusMessage("已关联教材，并同步为新课「学习中」");
      window.setTimeout(() => setStatusMessage(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusMessage(err instanceof Error ? err.message : "关联教材失败");
      window.setTimeout(() => setStatusMessage(""), 3500);
    } finally {
      window.clearInterval(timer);
      setLinkLessonProgressPercent(null);
      linkingManualLessonRef.current = false;
      setLinkingManualLesson(false);
    }
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
    const isRecurringSeries =
      draft.recurring === true ||
      (editingManual?.recurring_id != null &&
        Number(editingManual.recurring_id) > 0);
    try {
      const saved = isEditing
        ? await updateJpLessonManualSchedule(editingManual.id, draft)
        : await createJpLessonManualSchedule(draft);
      if (!saved) {
        setError("保存手动日程失败");
        return;
      }

      // 长期固定会一次写多条 / 重写未来实例，须 force 重拉列表
      if (isRecurringSeries) {
        await loadManualSchedules({ force: true });
      } else {
        setManualSchedules((prev) => {
          const next = isEditing
            ? prev.map((item) => (item.id === saved.id ? saved : item))
            : [...prev, saved];
          const sorted = next.sort((a, b) => a.class_at.localeCompare(b.class_at));
          syncJpLessonManualScheduleCache(sorted);
          return sorted;
        });
      }

      // 保存后再对齐一次：关联教材 → 学习中 + 时间/老师（防选后改过时间）
      // 长期固定只同步本条（服务端已挑最近未来堂）对应的时间
      const linked = saved.linked_lessons || [];
      if (isAdmin && linked.length > 0) {
        let syncFailed = "";
        let syncedJp = false;
        let syncedEn = false;
        for (const link of linked) {
          const teachersForSubject =
            link.subject === "en" ? enTeachers : teachers;
          const linkedLesson =
            link.subject === "en"
              ? enLessonById.get(link.lesson_id)
              : lessonById.get(link.lesson_id);
          const existingSchedules = (linkedLesson?.class_schedules ?? []).map(
            (row) => ({
              class_at: row.class_at,
              duration_minutes: row.duration_minutes,
            })
          );
          const result = await syncManualScheduleLinkedLessonToLearning({
            subject: link.subject,
            lessonId: link.lesson_id,
            classAt: saved.class_at,
            durationMinutes: saved.duration_minutes,
            teacherName: saved.teacher,
            teachers: teachersForSubject,
            locale,
            existingSchedules,
          });
          if (!result.ok) {
            syncFailed = syncManualScheduleLinkedLessonErrorMessage(result.error);
            break;
          }
          applyLinkedLessonSynced(
            link.subject,
            result.lesson,
            result.ensuredTeacher
          );
          if (link.subject === "jp") syncedJp = true;
          else syncedEn = true;
        }
        if (syncFailed) {
          setStatusMessage(
            (isEditing
              ? isRecurringSeries
                ? "长期固定已更新"
                : "手动日程已保存"
              : isRecurringSeries
                ? "长期固定已添加"
                : "手动日程已添加") + `，但教材同步失败：${syncFailed}`
          );
        } else {
          setStatusMessage(
            isEditing
              ? isRecurringSeries
                ? "长期固定已更新，教材已同步为学习中"
                : "手动日程已保存，教材已同步为学习中"
              : isRecurringSeries
                ? "长期固定已添加，教材已同步为学习中"
                : "手动日程已添加，教材已同步为学习中"
          );
          if (syncedJp) void loadLessons({ force: true });
          if (syncedEn) void loadEnLessons({ force: true });
        }
      } else {
        setStatusMessage(
          isEditing
            ? isRecurringSeries
              ? "长期固定已更新（整条每周规则）"
              : "手动日程已保存"
            : isRecurringSeries
              ? "长期固定已添加（约未来 12 周）"
              : "手动日程已添加"
        );
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
    const isRecurring =
      selectedManualSchedule.recurring_id != null &&
      Number(selectedManualSchedule.recurring_id) > 0;
    const ok = window.confirm(
      isRecurring
        ? "确定取消整条长期固定吗？今天及以后每周将不再排课（过去已上过的保留）。"
        : "确定删除这条手动日程吗？"
    );
    if (!ok) return;
    setError("");
    try {
      const recurringId = selectedManualSchedule.recurring_id;
      await deleteJpLessonManualSchedule(selectedManualSchedule.id);
      if (isRecurring && recurringId != null) {
        await loadManualSchedules({ force: true });
      } else {
        setManualSchedules((prev) => {
          const next = prev.filter((item) => item.id !== selectedManualSchedule.id);
          syncJpLessonManualScheduleCache(next);
          return next;
        });
      }
      setSelectedEventKey(null);
      if (isRecurring) {
        setStatusMessage("已取消长期固定");
        window.setTimeout(() => setStatusMessage(""), 3000);
      }
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
            "zh",
            "jp_vocab"
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
    openLinkLessonPick,
    closeLinkLessonPick,
    handleLinkLessonFromDetail,
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
