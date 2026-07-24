"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JpLessonAnnotateModal } from "@/components/JpLessonAnnotateModal";
import {
  JpLessonExamplesViewModal,
  type JpLessonExamplesViewTarget,
} from "@/components/JpLessonExamplesViewModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonBatchScheduleTeacherModal } from "@/components/JpLessonBatchScheduleTeacherModal";
import { JpLessonTeacherEditModal, type JpLessonTeacherAddInput, type JpLessonTeacherUpdateInput } from "@/components/JpLessonTeacherEditModal";
import { JpVocabRefEditModal } from "@/components/JpVocabRefEditModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import {
  blurActiveElementForLessonModalClose,
  scrollLessonListItemIntoView,
} from "@/lib/lesson-list-scroll";
import { lessonScheduleSaveErrorMessage } from "@/lib/lesson-class-schedule-form";
import {
  JP_LESSON_MOBILE_STATUS_FILTER_KEY,
  readStoredLessonMobileStatusFilter,
  writeStoredLessonMobileStatusFilter,
} from "@/lib/lesson-mobile-status-filter";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_LESSON_CACHE_KEY,
  JP_LESSON_REFRESH_TTL_MS,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  buildJpLessonDisplayGroupsById,
  buildLearningClassDayToneMap,
  getJpLessonProgressStatus,
  jpLessonProgressToFields,
  normalizeClassDurationMinutes,
  type JpLessonDisplayGroup,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import {
  fetchWithClientCache,
  readClientCacheAge,
} from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  jpLessonSchedulePath,
} from "@/lib/locale-path";
import { filterJpLessonsBySearch } from "@/lib/jp-lesson-search";
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
import { JP_SITE_URL } from "@/lib/jp-site-host";
import type {
  JpLessonClassScheduleInput,
  JpLessonNote,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
} from "@/lib/types";
import { JpLessonPageStyles } from "@/components/jp-lesson-page/JpLessonPageStyles";
import { JpLessonStatusTable } from "@/components/jp-lesson-page/JpLessonStatusTable";
import {
  DEFAULT_JP_LESSON_SECTION_SORT,
  LESSON_STATUS_SECTIONS,
  buildTeacherById,
  groupLessonsForDisplay,
  persistLessonCache,
  readLessonCache,
  teacherAutoEnableStatusSuffix,
  type TeacherAutoEnableInfo,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";


export function JpLessonPage() {
  const { locale } = useI18n();
  const { user, checking, hasPermission, openAuthPanel, isAdmin } = useEtrAuth();
  const canViewJpLesson =
    !user ||
    isAdmin ||
    hasPermission("jp_lesson:read") ||
    hasPermission("jp_lesson:operate");
  const canOperate = isAdmin || hasPermission("jp_lesson:operate");

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 日语新课",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);
  const [lessons, setLessons] = useState<JpLessonRecord[]>(() => readLessonCache()?.lessons ?? []);
  const [notes, setNotes] = useState<JpLessonNote[]>(() => readLessonCache()?.notes ?? []);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(
    () => readLessonCache()?.teachers ?? []
  );
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingTeacherLessonId, setSavingTeacherLessonId] = useState<number | null>(null);
  const [savingNextClassId, setSavingNextClassId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedBatchKey, setCopiedBatchKey] = useState<string | null>(null);
  const [mobileStatusFilter, setMobileStatusFilterState] =
    useState<JpLessonProgressStatus>(() =>
      readStoredLessonMobileStatusFilter(JP_LESSON_MOBILE_STATUS_FILTER_KEY)
    );
  const setMobileStatusFilter = useCallback((status: JpLessonProgressStatus) => {
    setMobileStatusFilterState(status);
    writeStoredLessonMobileStatusFilter(JP_LESSON_MOBILE_STATUS_FILTER_KEY, status);
  }, []);
  const [editingLesson, setEditingLesson] = useState<JpLessonRecord | null>(null);
  const [editingTeacherLesson, setEditingTeacherLesson] = useState<JpLessonRecord | null>(null);
  const [editingTeacherLessonIds, setEditingTeacherLessonIds] = useState<number[]>([]);
  const [editingNextClassLesson, setEditingNextClassLesson] = useState<JpLessonRecord | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchLessonIds, setBatchLessonIds] = useState<number[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [annotatingLesson, setAnnotatingLesson] = useState<{
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    /** 教案图片 API（随手画 canvas）；勿用查看页 HTML URL */
    imageUrl: string;
  } | null>(null);
  const [viewingExamples, setViewingExamples] = useState<JpLessonExamplesViewTarget | null>(
    null
  );
  const [expandedContentIds, setExpandedContentIds] = useState<Record<number, boolean>>({});
  const [expandedMeaningsIds, setExpandedMeaningsIds] = useState<Record<number, boolean>>({});
  const [sectionSort, setSectionSort] = useState(DEFAULT_JP_LESSON_SECTION_SORT);
  const [searchQuery, setSearchQuery] = useState("");

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

  const toggleRecentOperationSort = useCallback((status: JpLessonProgressStatus) => {
    if (status === "pending") return; // 未完成固定按 ID 升序
    setSectionSort((prev) => {
      const current = prev[status];
      if (current.field === "recentOperation") {
        return {
          ...prev,
          [status]: {
            field: "recentOperation",
            order: current.order === "asc" ? "desc" : "asc",
          },
        };
      }
      return {
        ...prev,
        [status]: { field: "recentOperation", order: "desc" },
      };
    });
  }, []);

  const toggleClassTimeSort = useCallback((status: JpLessonProgressStatus) => {
    if (status === "pending") return; // 未完成固定按 ID 升序
    setSectionSort((prev) => {
      const current = prev[status];
      if (current.field === "classTime") {
        return {
          ...prev,
          [status]: {
            field: "classTime",
            order: current.order === "asc" ? "desc" : "asc",
          },
        };
      }
      return {
        ...prev,
        [status]: { field: "classTime", order: "asc" },
      };
    });
  }, []);

  const applyLessonPayload = useCallback((payload: JpLessonApiPayload) => {
    setLessons(payload.lessons);
    setNotes(payload.notes);
    setRefs(payload.refs);
    if (payload.teachers) {
      setTeachers(payload.teachers.map((teacher) => normalizeJpLessonTeacher(teacher)));
    }
  }, []);

  const loadLessons = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readLessonCache();
    const hasCache = cached != null;
    const cacheAge = readClientCacheAge(JP_LESSON_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_REFRESH_TTL_MS;

    if (hasCache) {
      applyLessonPayload(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const payload = await fetchWithClientCache(
        JP_LESSON_CACHE_KEY,
        "/api/jp-lesson",
        parseJpLessonApi,
        {
          onCached: applyLessonPayload,
          ttlMs: JP_LESSON_REFRESH_TTL_MS,
          force: opts?.force,
        }
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
    if (user && !checking && !canViewJpLesson) return;
    void loadLessons();
  }, [loadLessons, checking, user, canViewJpLesson]);

  const teacherById = useMemo(() => buildTeacherById(teachers), [teachers]);

  const searchActive = searchQuery.trim().length > 0;

  const filteredLessons = useMemo(
    () => filterJpLessonsBySearch(lessons, searchQuery, teacherById),
    [lessons, searchQuery, teacherById]
  );

  const lessonsByStatus = useMemo(() => {
    const buckets: Record<JpLessonProgressStatus, JpLessonRecord[]> = {
      learning: [],
      pending: [],
      completed: [],
    };
    for (const lesson of filteredLessons) {
      buckets[getJpLessonProgressStatus(lesson)].push(lesson);
    }
    return buckets;
  }, [filteredLessons]);

  const displayGroupsByStatus = useMemo(() => {
    const groups: Record<JpLessonProgressStatus, JpLessonDisplayGroup<JpLessonRecord>[]> = {
      learning: groupLessonsForDisplay(lessonsByStatus.learning, sectionSort.learning),
      // 未完成：ID 越小越靠前（先上传的基础课优先），手机 / PC 同一套
      pending: buildJpLessonDisplayGroupsById(lessonsByStatus.pending),
      completed: groupLessonsForDisplay(lessonsByStatus.completed, sectionSort.completed),
    };
    return groups;
  }, [lessonsByStatus, sectionSort]);

  const learningDayToneByDate = useMemo(
    () => buildLearningClassDayToneMap(displayGroupsByStatus.learning),
    [displayGroupsByStatus.learning]
  );

  const noteCountByLesson = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of notes) {
      map.set(note.lesson_id, (map.get(note.lesson_id) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  const openTeacherEditModal = useCallback((lesson: JpLessonRecord, lessonIds?: number[]) => {
    setTeachers((prev) => mergeJpLessonTeachersCache(prev, readJpLessonTeachersCache()));
    setEditingTeacherLesson(lesson);
    setEditingTeacherLessonIds(
      (lessonIds?.length ? lessonIds : [lesson.id]).filter(
        (id, index, arr) => arr.indexOf(id) === index
      )
    );
  }, []);

  const openNextClassEditModal = useCallback((lesson: JpLessonRecord) => {
    setTeachers((prev) => mergeJpLessonTeachersCache(prev, readJpLessonTeachersCache()));
    setEditingNextClassLesson(lesson);
  }, []);

  const handleLessonLinkCopied = useCallback((lessonId: number) => {
    setCopiedId(lessonId);
    window.setTimeout(() => setCopiedId(null), 1000);
    setLessons((prev) =>
      prev.map((lesson) =>
        lesson.id === lessonId
          ? { ...lesson, link_copy_count: (lesson.link_copy_count ?? 0) + 1 }
          : lesson
      )
    );
    void fetch("/api/jp-lesson", {
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

  const handleBatchLinkCopied = useCallback((batchKey: string) => {
    setCopiedBatchKey(batchKey);
    window.setTimeout(() => setCopiedBatchKey(null), 1200);
  }, []);

  const handleLessonLinkCopyError = useCallback(() => {
    setStatus("复制失败，请手动选择复制");
  }, []);

  useEffect(() => {
    setBatchLessonIds((prev) =>
      prev.filter((id) => {
        const lesson = lessons.find((item) => item.id === id);
        return lesson != null && getJpLessonProgressStatus(lesson) === "pending";
      })
    );
  }, [lessons]);

  const toggleBatchLesson = useCallback((lessonId: number) => {
    setBatchLessonIds((prev) =>
      prev.includes(lessonId)
        ? prev.filter((id) => id !== lessonId)
        : [...prev, lessonId]
    );
  }, []);

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
    const optimistic = jpLessonProgressToFields(progressStatus);
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
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
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
        persistLessonCache(next, refs, notes, nextTeachers);
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
            "zh"
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
        persistLessonCache(next, refs, notes, teachers);
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
          };
          if (!progressData.ok) {
            throw new Error(progressData.error || `课程 #${lessonId} 状态保存失败`);
          }
          for (const row of progressData.teacher_auto_enable?.enabled ?? []) {
            const name = String(row.username ?? "").trim();
            if (name) autoEnabledUsernames.push(name);
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
        persistLessonCache(next, refs, notes, teachers);
        return next;
      });
      const autoEnableSuffix = teacherAutoEnableStatusSuffix({
        enabled: autoEnabledUsernames.map((username) => ({ username })),
      });
      setStatus(
        `已批量更新 ${batchLessonIds.length} 条未上课教案${autoEnableSuffix}`
      );
      const firstBatchId = batchLessonIds[0];
      blurActiveElementForLessonModalClose();
      setBatchLessonIds([]);
      setBatchModalOpen(false);
      if (firstBatchId != null) scrollLessonListItemIntoView(firstBatchId);
      window.setTimeout(() => setStatus(""), 4000);
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
    persistLessonCache(nextLessons, nextRefs, notes, teachers);
    setStatus("教案已更新，仅影响本条新课。");
    window.setTimeout(() => setStatus(""), 2500);
  };

  const handleAnnotateSaved = (ref: JpVocabRef, lesson: JpLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, notes, teachers);
    setAnnotatingLesson((prev) => {
      if (!prev || prev.lesson.id !== lesson.id) return prev;
      const imageUrl = jpVocabRefApiPath(ref.ref_key, { v: ref.updated_at });
      return { lesson, ref, imageUrl };
    });
  };

  const editingRef = editingLesson?.ref_key ? refs[editingLesson.ref_key] : undefined;


  return (
    <main
      className="page-wrap jp-lesson-page jp-lesson-page--ja"
      style={{ maxWidth: "min(1320px, 92vw)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语新课</h1>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；具备「新课编辑」权限的登录用户可设置学习状态（未完成 / 学习中 / 已完成）。仅「已完成」会同步进入
        <a href="/jp-vocab" style={{ color: "var(--accent)" }}>
          日语单词抽问
        </a>
        并带上教案链接。
      </p>

      {user && !checking && !canViewJpLesson ? (
        <section className="section etr-panel">
          <p style={{ color: "var(--muted)", margin: 0 }}>
            您没有日语新课的查看权限。如需访问，请联系管理员在「角色权限管理」中为您的角色开启「日语新课 · 查看/浏览」或「编辑/操作」权限。
          </p>
        </section>
      ) : (
        <>

      {isAdmin ? (
        <div className="jp-lesson-admin-links">
          <a href={jpLessonSchedulePath()} style={{ color: "var(--accent)" }}>
            日程管理
          </a>
          <a href={adminJpLessonTeachersPath(locale)} style={{ color: "var(--accent)" }}>
            人员管理
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

      <div className="jp-lesson-search" role="search">
        <label htmlFor="jp-lesson-search" className="jp-lesson-search__label">
          查单词 / 语法 / 老师
        </label>
        <div className="jp-lesson-search__row">
          <input
            id="jp-lesson-search"
            type="search"
            className="jp-lesson-search__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="学习内容、释义、例句、上课老师…（模糊匹配，本地即时）"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {searchActive ? (
          <>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-lesson-search__clear"
              onClick={() => setSearchQuery("")}
            >
              清除
            </button>
            <span className="jp-lesson-search__meta">
              匹配 {filteredLessons.length} / {lessons.length} 条
            </span>
          </>
        ) : null}
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : !lessons.length ? (
        <section className="section etr-panel" aria-label="学习清单">
          <p style={{ color: "var(--muted)", margin: 0 }}>暂无新课，请通过 API 上传。</p>
        </section>
      ) : (
        <>
        {searchActive && !filteredLessons.length ? (
          <p className="jp-lesson-search__empty">
            没有匹配「{searchQuery.trim()}」的新课，请换个关键词试试。
          </p>
        ) : null}
        <div
          className={`jp-lesson-cards ${
            searchActive
              ? "jp-lesson-mobile-filter-search"
              : `jp-lesson-mobile-filter-${mobileStatusFilter}`
          }`}
        >
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
          <div className="jp-lesson-mobile-status-filter" role="tablist" aria-label="学习状态筛选">
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
            if (searchActive && !sectionCount) return null;
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
                {isAdmin && status === "pending" && sectionCount ? (
                  <div className="jp-lesson-batch-toolbar">
                    <button
                      type="button"
                      className="jp-lesson-action-btn"
                      disabled={!batchLessonIds.length}
                      onClick={() => setBatchModalOpen(true)}
                    >
                      设置时间和老师
                      {batchLessonIds.length ? `（${batchLessonIds.length}）` : ""}
                    </button>
                    {batchLessonIds.length ? (
                      <button
                        type="button"
                        className="jp-lesson-action-btn"
                        onClick={() => setBatchLessonIds([])}
                      >
                        清空勾选
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {sectionCount ? (
                  <JpLessonStatusTable
                    displayGroups={sectionGroups}
                    status={status}
                    dayToneByDate={
                      status === "learning" ? learningDayToneByDate : undefined
                    }
                    sectionSort={sectionSort[status]}
                    isAdmin={isAdmin}
                    canOperate={canOperate}
                    refs={refs}
                    teacherById={teacherById}
                    noteCountByLesson={noteCountByLesson}
                    batchLessonIds={batchLessonIds}
                    expandedContentIds={expandedContentIds}
                    expandedMeaningsIds={expandedMeaningsIds}
                    savingId={savingId}
                    savingNextClassId={savingNextClassId}
                    copiedId={copiedId}
                    copiedBatchKey={copiedBatchKey}
                    onToggleRecentOperationSort={() =>
                      toggleRecentOperationSort(status)
                    }
                    onToggleClassTimeSort={() => toggleClassTimeSort(status)}
                    onToggleBatchLesson={toggleBatchLesson}
                    onToggleContentExpanded={toggleContentExpanded}
                    onToggleMeaningsExpanded={toggleMeaningsExpanded}
                    onSetLessonProgress={setLessonProgress}
                    onViewExamples={setViewingExamples}
                    onEditLesson={setEditingLesson}
                    onAnnotateLesson={setAnnotatingLesson}
                    onOpenTeacherEdit={openTeacherEditModal}
                    onOpenNextClassEdit={openNextClassEditModal}
                    onLessonLinkCopied={handleLessonLinkCopied}
                    onBatchLinkCopied={handleBatchLinkCopied}
                    onLessonLinkCopyError={handleLessonLinkCopyError}
                  />
                ) : searchActive ? null : (
                  <p className="jp-lesson-status-card-empty">{emptyHint}</p>
                )}
              </section>
            );
          })}
        </div>
        </>
      )}

      <JpLessonTeacherEditModal
        open={editingTeacherLesson != null}
        lesson={editingTeacherLesson}
        teachers={teachers}
        saving={savingTeacherLessonId === editingTeacherLesson?.id}
        onClose={() => {
          setEditingTeacherLesson(null);
          setEditingTeacherLessonIds([]);
        }}
        onAddTeacher={addLessonTeacher}
        onUpdateTeacher={updateLessonTeacher}
        onDeleteTeacher={deleteLessonTeacher}
        onSave={async (teacherIds, teacherOther, teacherUpdates, options) => {
          if (editingTeacherLesson) {
            await setLessonTeachersForMany(
              editingTeacherLessonIds.length
                ? editingTeacherLessonIds
                : [editingTeacherLesson.id],
              teacherIds,
              teacherOther,
              teacherUpdates,
              options
            );
          }
        }}
      />

      <JpLessonNextClassEditModal
        open={editingNextClassLesson != null}
        lesson={editingNextClassLesson}
        saving={savingNextClassId === editingNextClassLesson?.id}
        onClose={() => setEditingNextClassLesson(null)}
        onSave={(schedules) => {
          if (editingNextClassLesson) {
            void setLessonClassSchedules(editingNextClassLesson.id, schedules);
          }
        }}
        onEditTeachers={() => {
          if (!editingNextClassLesson) return;
          const lesson = editingNextClassLesson;
          setEditingNextClassLesson(null);
          openTeacherEditModal(lesson);
        }}
      />

      <JpLessonBatchScheduleTeacherModal
        open={batchModalOpen}
        lessonCount={batchLessonIds.length}
        teachers={teachers}
        saving={batchSaving}
        onClose={() => {
          if (!batchSaving) setBatchModalOpen(false);
        }}
        onSave={(schedules, teacherIds, teacherOther, progressStatus) => {
          void setBatchClassSchedulesAndTeachers(
            schedules,
            teacherIds,
            teacherOther,
            progressStatus
          );
        }}
      />

      <JpVocabRefEditModal
        open={editingLesson != null}
        lessonId={editingLesson?.id ?? null}
        refKey={editingLesson?.ref_key ?? null}
        refMeta={editingRef}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingLesson(null)}
        onUpdated={handleRefUpdated}
        onNeedAuth={openJpAuth}
      />

      <JpLessonAnnotateModal
        open={annotatingLesson != null}
        imageUrl={annotatingLesson?.imageUrl ?? ""}
        refKey={annotatingLesson?.lesson.ref_key ?? ""}
        lessonId={annotatingLesson?.lesson.id ?? 0}
        lessonContent={annotatingLesson?.lesson.content ?? ""}
        locale={locale}
        canSave={canOperate}
        onClose={() => setAnnotatingLesson(null)}
        onSaved={handleAnnotateSaved}
        onNeedAuth={openJpAuth}
      />

      <JpLessonExamplesViewModal
        open={viewingExamples != null}
        target={viewingExamples}
        onClose={() => setViewingExamples(null)}
      />

      <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>API 上传说明</summary>
        <p style={{ marginTop: "0.5rem" }}>
          固定链接：<code>{JP_SITE_URL}/jp-lesson</code>
        </p>
        <p>
          上传接口：<code>POST /api/jp-lesson/upload</code>，Header{" "}
          <code>Authorization: Bearer &lt;JP_REVIEW_UPLOAD_TOKEN&gt;</code>
        </p>
        <pre
          style={{
            overflow: "auto",
            padding: "0.75rem",
            background: "var(--panel)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
{`curl -X POST "${JP_SITE_URL}/api/jp-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "meanings=（刚刚，只是……）|（变得能够……）|（来……做……）" \\
  -F "example_sentences=遊んでばかりいます。
译文：光在玩。
今来たばかりです。
译文：刚来。|||日本語が話せるようになりました。
译文：已经会说日语了。
毎日早く起きるようになりました。
译文：开始每天早起了。|||ご飯を食べに来ます。
译文：来吃饭。
買い物に来ました。
译文：来买东西了。" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔；可选 <code>meanings</code> 与
          <code>content</code> 各项一一对应，多项释义用竖线 <code>|</code> 分隔（释义内可含逗号）。
          强烈建议同时传可选 <code>example_sentences</code>：与 <code>content</code> 各项一一对应，多项之间用{" "}
          <code>|||</code> 分隔；每一项里写若干「日语句 + 下一行 <code>译文：…</code>」（也可写{" "}
          <code>1. …</code> 序号，入库时会规范化）。每个单词/语法最多 10 条例句，条数由上传方自定。
          上传带 <code>file</code> 时，系统会自动生成教案标识（如 <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
          上传后默认「未完成」；在列表中改为「已完成」后，会同步写入
          日语单词抽问并带上教案链接、释义与例句。
        </p>
      </details>
        </>
      )}

      <JpLessonPageStyles />
    </main>
  );
}
