"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import {
  type EnLessonImportScheduleApi,
} from "@/components/en-lesson-page/EnLessonImportScheduleBridge";
import {
  type EnLessonEditApi,
} from "@/components/en-lesson-page/EnLessonEditBridge";
import { EnLessonPageHeader } from "@/components/en-lesson-page/EnLessonPageHeader";
import { EnLessonPageModals } from "@/components/en-lesson-page/EnLessonPageModals";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { lessonScheduleSaveErrorMessage } from "@/lib/lesson-class-schedule-form";
import {
  EN_LESSON_MOBILE_STATUS_FILTER_KEY,
  readStoredLessonMobileStatusFilter,
  writeStoredLessonMobileStatusFilter,
} from "@/lib/lesson-mobile-status-filter";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_LESSON_CACHE_KEY,
  parseEnLessonApi,
  type EnLessonApiPayload,
} from "@/lib/en-api-cache";
import {
  buildLearningClassDayToneMap,
  formatLessonContentLines,
  getEnLessonProgressStatus,
  enLessonProgressToFields,
  normalizeClassDurationMinutes,
  type EnLessonDisplayGroup,
  type EnLessonProgressStatus,
} from "@/lib/en-lesson-shared";
import {
  buildEnLessonDisplayGroupsForTableSort,
  DEFAULT_EN_LESSON_TABLE_SORT,
  nextEnLessonTableSort,
  type EnLessonTableSort,
  type EnLessonTableSortKey,
} from "@/lib/en-lesson-table-sort";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  enLessonSchedulePath,
} from "@/lib/locale-path";
import { enVocabRefApiPath } from "@/lib/en-vocab-ref-shared";
import type {
  EnLessonClassScheduleInput,
  EnLessonNote,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
} from "@/lib/types";
import { EnLessonPageStyles } from "@/components/en-lesson-page/EnLessonPageStyles";
import { EnLessonStatusTable } from "@/components/en-lesson-page/EnLessonStatusTable";
import type { EnLessonTeacherUpdateInput } from "@/components/EnLessonTeacherEditModal";

import {
  readLessonCache,
  persistLessonCache,
  LESSON_STATUS_SECTIONS,
  mergeEnLessonTeachers,
} from "@/components/en-lesson-page/en-lesson-page-helpers";

export function EnLessonPage() {
  const { locale } = useI18n();
  const { user, checking, hasPermission, openAuthPanel, isAdmin } = useEtrAuth();
  const canViewEnLesson =
    !user ||
    isAdmin ||
    hasPermission("en_lesson:read") ||
    hasPermission("en_lesson:operate");
  const canOperate = isAdmin || hasPermission("en_lesson:operate");

  const openEnAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 英语新课",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);
  const [lessons, setLessons] = useState<EnLessonRecord[]>(() => readLessonCache()?.lessons ?? []);
  const [notes, setNotes] = useState<EnLessonNote[]>(() => readLessonCache()?.notes ?? []);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [teachers, setTeachers] = useState<EnLessonTeacher[]>(
    () => readLessonCache()?.teachers ?? []
  );
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingTeacherId, setSavingTeacherId] = useState<number | null>(null);
  const [savingNextClassId, setSavingNextClassId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const importScheduleApiRef = useRef<EnLessonImportScheduleApi | null>(null);
  const editContentApiRef = useRef<EnLessonEditApi | null>(null);
  const [mobileStatusFilter, setMobileStatusFilterState] =
    useState<EnLessonProgressStatus>(() =>
      readStoredLessonMobileStatusFilter(EN_LESSON_MOBILE_STATUS_FILTER_KEY)
    );
  const setMobileStatusFilter = useCallback((status: EnLessonProgressStatus) => {
    setMobileStatusFilterState(status);
    writeStoredLessonMobileStatusFilter(EN_LESSON_MOBILE_STATUS_FILTER_KEY, status);
  }, []);
  const [editingLesson, setEditingLesson] = useState<EnLessonRecord | null>(null);
  const [editingTeacherLesson, setEditingTeacherLesson] = useState<EnLessonRecord | null>(null);
  const [editingNextClassLesson, setEditingNextClassLesson] = useState<EnLessonRecord | null>(null);
  const [annotatingLesson, setAnnotatingLesson] = useState<{
    lesson: EnLessonRecord;
    ref: EnVocabRef;
    /** 教案文件 API（图片或 PDF）；勿用查看页 HTML URL */
    imageUrl: string;
    mediaType?: "image" | "pdf";
  } | null>(null);
  const [expandedContentIds, setExpandedContentIds] = useState<Record<number, boolean>>({});
  const [expandedMeaningsIds, setExpandedMeaningsIds] = useState<Record<number, boolean>>({});
  const [tableSort, setTableSort] = useState<EnLessonTableSort>(
    () => DEFAULT_EN_LESSON_TABLE_SORT
  );

  const toggleContentExpanded = useCallback((lessonId: number) => {
    setExpandedContentIds((prev) => ({
      ...prev,
      [lessonId]: !prev[lessonId],
    }));
  }, []);

  const toggleMeaningsExpanded = useCallback((lessonId: number) => {
    setExpandedMeaningsIds((prev) => ({
      ...prev,
      [lessonId]: !prev[lessonId],
    }));
  }, []);
  const toggleTableSort = useCallback((key: EnLessonTableSortKey) => {
    setTableSort((prev) => nextEnLessonTableSort(prev, key));
  }, []);

  const applyLessonPayload = useCallback((payload: EnLessonApiPayload) => {
    setLessons(payload.lessons);
    setNotes(payload.notes);
    setRefs(payload.refs);
    if (payload.teachers) {
      setTeachers(payload.teachers);
    }
  }, []);

  const loadLessons = useCallback(async () => {
    const hasCache = readLessonCache() != null;
    if (hasCache) {
      setRefreshing(true);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const payload = await fetchWithClientCache(
        JP_LESSON_CACHE_KEY,
        "/api/en-lesson",
        parseEnLessonApi,
        { onCached: applyLessonPayload }
      );
      applyLessonPayload(payload);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyLessonPayload]);

  useEffect(() => {
    if (user && !checking && !canViewEnLesson) return;
    void loadLessons();
  }, [loadLessons, checking, user, canViewEnLesson]);

  const lessonsByStatus = useMemo(() => {
    const buckets: Record<EnLessonProgressStatus, EnLessonRecord[]> = {
      learning: [],
      pending: [],
      completed: [],
    };
    for (const lesson of lessons) {
      buckets[getEnLessonProgressStatus(lesson)].push(lesson);
    }
    return buckets;
  }, [lessons]);

  const noteCountByLesson = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of notes) {
      map.set(note.lesson_id, (map.get(note.lesson_id) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [teachers]);

  const tableSortCtx = useMemo(
    () => ({ teacherNameById, noteCountByLesson }),
    [teacherNameById, noteCountByLesson]
  );

  const displayGroupsByStatus = useMemo(() => {
    const groups: Record<EnLessonProgressStatus, EnLessonDisplayGroup<EnLessonRecord>[]> = {
      learning: buildEnLessonDisplayGroupsForTableSort(
        lessonsByStatus.learning,
        tableSort,
        tableSortCtx
      ),
      pending: buildEnLessonDisplayGroupsForTableSort(
        lessonsByStatus.pending,
        tableSort,
        tableSortCtx
      ),
      completed: buildEnLessonDisplayGroupsForTableSort(
        lessonsByStatus.completed,
        tableSort,
        tableSortCtx
      ),
    };
    return groups;
  }, [lessonsByStatus, tableSort, tableSortCtx]);

  const learningDayToneByDate = useMemo(
    () => buildLearningClassDayToneMap(displayGroupsByStatus.learning),
    [displayGroupsByStatus.learning]
  );

  const handleLessonCopied = useCallback((lessonId: number) => {
    setCopiedId(lessonId);
    window.setTimeout(() => setCopiedId(null), 1000);
    setLessons((prev) =>
      prev.map((lesson) =>
        lesson.id === lessonId
          ? { ...lesson, link_copy_count: (lesson.link_copy_count ?? 0) + 1 }
          : lesson
      )
    );
    void fetch("/api/en-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_link_copy", lesson_id: lessonId }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; link_copy_count?: number };
        if (data.ok && typeof data.link_copy_count === "number") {
          setLessons((prev) =>
            prev.map((lesson) =>
              lesson.id === lessonId
                ? { ...lesson, link_copy_count: data.link_copy_count! }
                : lesson
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleLessonCopyError = useCallback(() => {
    setStatus("复制失败，请手动选择复制");
  }, []);

  const handleImportScheduleLessonSynced = useCallback(
    (lesson: EnLessonRecord) => {
      setLessons((prev) => {
        const next = prev.map((row) => (row.id === lesson.id ? lesson : row));
        persistLessonCache(next, refs, notes, teachers);
        return next;
      });
      setMobileStatusFilter("learning");
      scrollLessonListItemIntoView(lesson.id);
    },
    [notes, refs, setMobileStatusFilter, teachers]
  );

  const handleImportScheduleStatus = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 3500);
  }, []);

  const setLessonProgress = async (
    lessonId: number,
    progressStatus: EnLessonProgressStatus
  ) => {
    if (!canOperate) {
      openEnAuth();
      return;
    }
    if (savingId === lessonId) return;

    const snapshot = lessons.find((l) => l.id === lessonId);
    const optimistic = enLessonProgressToFields(progressStatus);
    setSavingId(lessonId);
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
      persistLessonCache(next, refs, notes, teachers);
      return next;
    });

    try {
      const res = await fetch("/api/en-lesson", {
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
        lesson?: EnLessonRecord;
        error?: string;
        message?: string;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.message || data.error || "保存失败");
      }
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== data.lesson!.id) return l;
          const server = data.lesson!;
          return {
            ...server,
            teacher_ids: server.teacher_ids?.length
              ? server.teacher_ids
              : (l.teacher_ids ?? []),
            teacher_other: server.teacher_other ?? l.teacher_other,
            class_schedules: server.class_schedules?.length
              ? server.class_schedules
              : l.class_schedules,
            next_class_at: server.next_class_at ?? l.next_class_at,
            class_duration_minutes:
              server.class_duration_minutes ?? l.class_duration_minutes,
          };
        });
        persistLessonCache(next, refs, notes, teachers);
        return next;
      });
    } catch (err) {
      if (snapshot) {
        setLessons((prev) => {
          const next = prev.map((l) => (l.id === lessonId ? snapshot : l));
          persistLessonCache(next, refs, notes, teachers);
          return next;
        });
      }
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const setLessonTeachers = async (
    lessonId: number,
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates: EnLessonTeacherUpdateInput[] = [],
    options?: { keepOpen?: boolean }
  ) => {
    if (!isAdmin) return;
    if (savingTeacherId === lessonId) {
      throw new Error("保存进行中，请稍候");
    }

    const snapshot = lessons.find((l) => l.id === lessonId);
    setSavingTeacherId(lessonId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, teacher_ids: teacherIds, teacher_other: teacherOther } : l
      )
    );

    try {
      // 只收集本次 update 返回的老师；合并进当前 state，避免覆盖刚 add 的新老师
      const updatedTeachers: EnLessonTeacher[] = [];
      for (const input of teacherUpdates) {
        const res = await fetch("/api/admin/en-lesson-teachers", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: input.id,
            name: input.name,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          teacher?: EnLessonTeacher;
          error?: string;
        };
        if (!data.ok || !data.teacher) {
          throw new Error(data.error || "保存老师信息失败");
        }
        updatedTeachers.push(data.teacher);
      }

      const res = await fetch("/api/en-lesson", {
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
        lesson?: EnLessonRecord;
        error?: string;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }

      let mergedTeachers: EnLessonTeacher[] = [];
      setTeachers((prev) => {
        mergedTeachers = updatedTeachers.length
          ? mergeEnLessonTeachers(prev, updatedTeachers)
          : prev;
        return mergedTeachers;
      });
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== data.lesson!.id) return l;
          const server = data.lesson!;
          return {
            ...server,
            teacher_ids: server.teacher_ids?.length ? server.teacher_ids : teacherIds,
            teacher_other: server.teacher_other ?? teacherOther,
            class_schedules: server.class_schedules?.length
              ? server.class_schedules
              : l.class_schedules,
            next_class_at: server.next_class_at ?? l.next_class_at,
            class_duration_minutes:
              server.class_duration_minutes ?? l.class_duration_minutes,
          };
        });
        persistLessonCache(next, refs, notes, mergedTeachers);
        return next;
      });
      if (options?.keepOpen) {
        setEditingTeacherLesson((prev) =>
          prev && prev.id === data.lesson!.id
            ? {
                ...prev,
                teacher_ids: data.lesson!.teacher_ids?.length
                  ? data.lesson!.teacher_ids
                  : teacherIds,
                teacher_other: data.lesson!.teacher_other ?? teacherOther,
              }
            : prev
        );
      } else {
        blurActiveElementForLessonModalClose();
        setEditingTeacherLesson(null);
        scrollLessonListItemIntoView(lessonId);
      }
      setStatus("上课老师已更新");
      window.setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      if (snapshot) {
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonId ? snapshot : l))
        );
      }
      setStatus(err instanceof Error ? err.message : "保存失败");
      throw err;
    } finally {
      setSavingTeacherId(null);
    }
  };

  const deleteLessonTeacher = async (id: number, name: string): Promise<boolean> => {
    if (!isAdmin) return false;
    try {
      const res = await fetch(`/api/admin/en-lesson-teachers?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || "删除失败");
        return false;
      }
      setTeachers((prev) => {
        const next = prev.filter((teacher) => teacher.id !== id);
        persistLessonCache(lessons, refs, notes, next);
        return next;
      });
      setLessons((prev) =>
        prev.map((lesson) =>
          lesson.teacher_ids?.includes(id)
            ? {
                ...lesson,
                teacher_ids: (lesson.teacher_ids ?? []).filter((teacherId) => teacherId !== id),
              }
            : lesson
        )
      );
      setStatus(`已删除老师：${name}`);
      window.setTimeout(() => setStatus(""), 2500);
      return true;
    } catch {
      setStatus("删除失败");
      return false;
    }
  };

  const addLessonTeacher = async (
    name: string,
    opts?: { tencentMeetingId?: string | null }
  ): Promise<EnLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/en-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(opts?.tencentMeetingId != null
            ? { tencent_meeting_id: opts.tencentMeetingId }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: EnLessonTeacher;
        renamed_teachers?: EnLessonTeacher[];
        error?: string;
      };
      if (!data.ok || !data.teacher) {
        return null;
      }
      setTeachers((prev) => {
        const renamedMap = new Map(
          (data.renamed_teachers ?? []).map((teacher) => [teacher.id, teacher])
        );
        const merged = prev.map((teacher) => renamedMap.get(teacher.id) ?? teacher);
        const next = [...merged.filter((teacher) => teacher.id !== data.teacher!.id), data.teacher!].sort(
          (a, b) => a.sort_order - b.sort_order || a.id - b.id
        );
        persistLessonCache(lessons, refs, notes, next);
        return next;
      });
      return data.teacher;
    } catch {
      return null;
    }
  };

  const setLessonClassSchedules = async (
    lessonId: number,
    schedules: EnLessonClassScheduleInput[]
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
        throw new Error(lessonScheduleSaveErrorMessage(data.error));
      }
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== data.lesson!.id) return l;
          return data.lesson!;
        });
        persistLessonCache(next, refs, notes, teachers);
        return next;
      });
      blurActiveElementForLessonModalClose();
      setEditingNextClassLesson(null);
      if (normalized.length > 0) setMobileStatusFilter("learning");
      setStatus(
        normalized.length > 0 ? "上课时间已更新，已设为上课中" : "上课时间已更新"
      );
      scrollLessonListItemIntoView(lessonId);
      window.setTimeout(() => setStatus(""), 2500);
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

  const handleRefUpdated = (ref: EnVocabRef, lesson: EnLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, notes, teachers);
    setStatus("教案已更新，仅影响本条新课。");
    window.setTimeout(() => setStatus(""), 2500);
  };

  const handleAnnotateSaved = (ref: EnVocabRef, lesson: EnLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, notes, teachers);
    setAnnotatingLesson((prev) => {
      if (!prev || prev.lesson.id !== lesson.id) return prev;
      const imageUrl = enVocabRefApiPath(ref.ref_key, { v: ref.updated_at });
      return {
        lesson,
        ref,
        imageUrl,
        mediaType: ref.media_type === "pdf" ? "pdf" : "image",
      };
    });
  };

  const deleteLesson = async (lesson: EnLessonRecord) => {
    if (!canOperate) {
      openEnAuth();
      return;
    }
    if (deletingId === lesson.id) return;

    const preview = formatLessonContentLines(lesson.content, 5).join(" / ");
    const ok = window.confirm(
      `确定删除新课 #${lesson.id}（${preview}）？此操作不可恢复。`
    );
    if (!ok) return;

    setDeletingId(lesson.id);
    setStatus("");
    try {
      const res = await fetch("/api/en-lesson", {
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

      setLessons((prev) => {
        const next = prev.filter((l) => l.id !== lesson.id);
        const nextNotes = notes.filter((n) => n.lesson_id !== lesson.id);
        persistLessonCache(next, refs, nextNotes, teachers);
        return next;
      });
      setNotes((prev) => prev.filter((n) => n.lesson_id !== lesson.id));
      setStatus(`已删除新课 #${lesson.id}`);
      window.setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="page-wrap jp-lesson-page jp-lesson-page--en" style={{ maxWidth: "min(1320px, 100%)", paddingTop: "1.5rem" }}>
      <EnLessonPageHeader
        canOperate={canOperate}
        onAddClick={() => {
          if (!user) {
            openEnAuth();
            return;
          }
          setCreateOpen(true);
        }}
      />

      {user && !checking && !canViewEnLesson ? (
        <section className="section etr-panel">
          <p style={{ color: "var(--muted)", margin: 0 }}>
            您没有英语新课的查看权限。如需访问，请联系管理员在「角色权限管理」中为您的角色开启「英语新课 ·
            查看/浏览」或「编辑/操作」权限。
          </p>
        </section>
      ) : (
        <>

      {isAdmin ? (
        <div className="jp-lesson-admin-links">
          <a href={enLessonSchedulePath()} style={{ color: "var(--accent)" }}>
            日程管理
          </a>
          <a href={adminJpLessonTeachersPath(locale, undefined, "en")} style={{ color: "var(--accent)" }}>
            上课老师管理
          </a>
          <span style={{ color: "var(--muted)" }}>（仅管理员可见）</span>
        </div>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {status ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>{status}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : !lessons.length ? (
        <section className="section etr-panel" aria-label="学习清单">
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {canOperate ? "暂无新课，请点击上方「新增」，或通过 API 上传。" : "暂无新课，请通过 API 上传。"}
          </p>
        </section>
      ) : (
        <div className={`jp-lesson-cards jp-lesson-mobile-filter-${mobileStatusFilter}`}>
          {refreshing ? (
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.875rem",
                margin: "0 0 0.25rem",
              }}
            >
              同步中…
            </p>
          ) : null}
          <div className="jp-lesson-mobile-status-filter" role="tablist" aria-label="上课状态筛选">
            {LESSON_STATUS_SECTIONS.map(({ status, title }) => {
              const sectionCount = lessonsByStatus[status].length;
              const active = mobileStatusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`jp-lesson-mobile-status-tab jp-lesson-mobile-status-tab--${status}${
                    active ? " is-active" : ""
                  }`}
                  onClick={() => setMobileStatusFilter(status)}
                >
                  <span className="jp-lesson-mobile-status-tab-label">{title}</span>
                  <span className="jp-lesson-mobile-status-tab-count">{sectionCount}</span>
                </button>
              );
            })}
          </div>
          {LESSON_STATUS_SECTIONS.map(({ status, title, emptyHint }) => {
            const sectionGroups = displayGroupsByStatus[status];
            const sectionCount = lessonsByStatus[status].length;
            return (
              <section
                key={status}
                className={`section etr-panel jp-lesson-status-card jp-lesson-status-card--${status}`}
                aria-label={`${title}新课`}
              >
                <div className="jp-lesson-status-card-head">
                  <h2 className="jp-lesson-status-card-title">{title}</h2>
                  <span className="jp-lesson-status-card-count">
                    {sectionCount} 条
                  </span>
                </div>
                {sectionCount ? (
                  <EnLessonStatusTable
                    displayGroups={sectionGroups}
                    dayToneByDate={
                      status === "learning" ? learningDayToneByDate : undefined
                    }
                    tableSort={tableSort}
                    isAdmin={isAdmin}
                    canOperate={canOperate}
                    refs={refs}
                    teachers={teachers}
                    teacherNameById={teacherNameById}
                    savingTeacherId={savingTeacherId}
                    noteCountByLesson={noteCountByLesson}
                    expandedContentIds={expandedContentIds}
                    expandedMeaningsIds={expandedMeaningsIds}
                    deletingId={deletingId}
                    savingId={savingId}
                    savingNextClassId={savingNextClassId}
                    copiedId={copiedId}
                    onTableSort={toggleTableSort}
                    onToggleContentExpanded={toggleContentExpanded}
                    onToggleMeaningsExpanded={toggleMeaningsExpanded}
                    onSetLessonProgress={setLessonProgress}
                    onEditLesson={setEditingLesson}
                    onEditContent={(lesson) => {
                      editContentApiRef.current?.open(lesson);
                    }}
                    onAnnotateLesson={setAnnotatingLesson}
                    onOpenTeacherEdit={setEditingTeacherLesson}
                    onOpenNextClassEdit={setEditingNextClassLesson}
                    onDeleteLesson={deleteLesson}
                    onImportSchedule={(lesson) => {
                      void importScheduleApiRef.current?.openImportSchedule(lesson);
                    }}
                    onLessonLinkCopied={handleLessonCopied}
                    onLessonLinkCopyError={handleLessonCopyError}
                    onCopyFeedback={setCopyToast}
                  />
                ) : (
                  <p className="jp-lesson-status-card-empty">{emptyHint}</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <EnLessonPageModals
        locale={locale}
        canOperate={canOperate}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        openEnAuth={openEnAuth}
        lessons={lessons}
        setLessons={setLessons}
        refs={refs}
        notes={notes}
        teachers={teachers}
        setTeachers={setTeachers}
        setMobileStatusFilter={setMobileStatusFilter}
        setStatus={setStatus}
        loadLessons={loadLessons}
        editContentApiRef={editContentApiRef}
        importScheduleApiRef={importScheduleApiRef}
        editingTeacherLesson={editingTeacherLesson}
        setEditingTeacherLesson={setEditingTeacherLesson}
        savingTeacherId={savingTeacherId}
        addLessonTeacher={addLessonTeacher}
        deleteLessonTeacher={deleteLessonTeacher}
        setLessonTeachers={setLessonTeachers}
        editingNextClassLesson={editingNextClassLesson}
        setEditingNextClassLesson={setEditingNextClassLesson}
        savingNextClassId={savingNextClassId}
        setLessonClassSchedules={setLessonClassSchedules}
        editingLesson={editingLesson}
        setEditingLesson={setEditingLesson}
        handleRefUpdated={handleRefUpdated}
        annotatingLesson={annotatingLesson}
        setAnnotatingLesson={setAnnotatingLesson}
        handleAnnotateSaved={handleAnnotateSaved}
        handleImportScheduleLessonSynced={handleImportScheduleLessonSynced}
        handleImportScheduleStatus={handleImportScheduleStatus}
        showOperateModals
      />
        </>
      )}

      <EnLessonPageStyles />
      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />
    </main>
  );
}
