"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpLessonAnnotateModal } from "@/components/JpLessonAnnotateModal";
import { JpLessonBatchCopyMenu } from "@/components/JpLessonBatchCopyMenu";
import { JpLessonCopyMenu } from "@/components/JpLessonCopyMenu";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonBatchScheduleTeacherModal } from "@/components/JpLessonBatchScheduleTeacherModal";
import { JpLessonTeacherEditModal, type JpLessonTeacherAddInput, type JpLessonTeacherUpdateInput } from "@/components/JpLessonTeacherEditModal";
import { JpVocabRefDownloadMenu } from "@/components/JpVocabRefDownloadMenu";
import { JpVocabRefEditModal } from "@/components/JpVocabRefEditModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime, formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_LESSON_CACHE_KEY,
  JP_LESSON_REFRESH_TTL_MS,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  buildJpLessonDisplayGroups,
  buildJpLessonDisplayGroupsByRecentOperation,
  buildLearningClassDayToneMap,
  formatClassDurationLabel,
  formatClassDurationLabelCompact,
  formatLessonContentLines,
  formatLessonExampleSentencesSummary,
  formatLessonMeaningsLines,
  formatNextClassAtLabel,
  formatNextClassAtLabelCompact,
  getJpLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  jpLessonProgressToFields,
  normalizeClassDurationMinutes,
  parseLessonContent,
  type JpLessonDisplayGroup,
  type JpLessonClassTimeSortOrder,
  type JpLessonRecentOperationSortOrder,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import {
  fetchWithClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  jpLessonSchedulePath,
} from "@/lib/locale-path";
import {
  adjustJpLessonTeacherLessonCounts,
  normalizeJpLessonTeacher,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import { JpLessonTeacherDisplay } from "@/components/JpLessonTeacherDisplay";
import {
  jpLessonRefDownloadFilename,
  jpVocabRefApiPath,
  jpVocabRefViewerPath,
} from "@/lib/jp-vocab-ref-shared";
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

function readLessonCache(): JpLessonApiPayload | null {
  const cached = readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
  if (!cached) return null;
  if (!Array.isArray(cached.teachers)) return cached;
  return {
    ...cached,
    teachers: cached.teachers.map((teacher) => normalizeJpLessonTeacher(teacher)),
  };
}

function persistLessonCache(
  lessons: JpLessonRecord[],
  refs: Record<string, JpVocabRef>,
  notes: JpLessonNote[],
  teachers?: JpLessonTeacher[]
) {
  writeClientCache(JP_LESSON_CACHE_KEY, { lessons, refs, notes, teachers });
}

function refViewUrl(refKey: string, updatedAt?: string | null): string {
  return jpVocabRefViewerPath(refKey, updatedAt);
}

const LESSON_STATUS_SECTIONS: {
  status: JpLessonProgressStatus;
  title: string;
  emptyHint: string;
}[] = [
  { status: "learning", title: "学习中", emptyHint: "暂无学习中的新课" },
  { status: "pending", title: "未完成", emptyHint: "暂无未完成的新课" },
  { status: "completed", title: "已完成", emptyHint: "暂无已完成的新课" },
];

type JpLessonSortField = "classTime" | "recentOperation";

type JpLessonSectionSort = {
  field: JpLessonSortField;
  order: JpLessonClassTimeSortOrder | JpLessonRecentOperationSortOrder;
};

const DEFAULT_JP_LESSON_SECTION_SORT: Record<JpLessonProgressStatus, JpLessonSectionSort> = {
  learning: { field: "classTime", order: "asc" },
  pending: { field: "classTime", order: "asc" },
  completed: { field: "recentOperation", order: "desc" },
};

function groupLessonsForDisplay(
  lessons: JpLessonRecord[],
  sort: JpLessonSectionSort
): JpLessonDisplayGroup<JpLessonRecord>[] {
  if (sort.field === "recentOperation") {
    return buildJpLessonDisplayGroupsByRecentOperation(
      lessons,
      sort.order as JpLessonRecentOperationSortOrder
    );
  }
  return buildJpLessonDisplayGroups(lessons, sort.order as JpLessonClassTimeSortOrder);
}

function refFilename(lesson: JpLessonRecord, ref?: JpVocabRef): string {
  const mediaType = ref?.media_type === "pdf" ? "pdf" : "image";
  return jpLessonRefDownloadFilename(lesson, mediaType);
}

function formatLessonContentOneLine(raw: string): string {
  const items = parseLessonContent(raw);
  if (!items.length) return raw.trim() || "—";
  return items.join("、");
}

function formatLessonMeaningsOneLine(
  content: string,
  meanings: string | null | undefined
): string {
  const aligned = formatLessonMeaningsLines(content, meanings, 99);
  if (!aligned.length || aligned.every((line) => line === "—")) return "—";
  return aligned.join(", ");
}

function formatLessonExamplesOneLine(
  content: string,
  examples: string | null | undefined
): string {
  return formatLessonExampleSentencesSummary(content, examples);
}

function renderLessonDateTime(iso: string) {
  return (
    <span className="jp-lesson-dt">
      <span className="jp-lesson-dt-full">{formatBeijingDateTime(iso)}</span>
      <span className="jp-lesson-dt-compact">{formatBeijingDateTimeCompact(iso)}</span>
    </span>
  );
}

function renderNextClassLabel(classAt: string, progressStatus: JpLessonProgressStatus) {
  return (
    <span className="jp-lesson-next-class-dt">
      <span className="jp-lesson-next-class-dt-full">
        {formatNextClassAtLabel(classAt, progressStatus)}
      </span>
      <span className="jp-lesson-next-class-dt-compact">
        {formatNextClassAtLabelCompact(classAt, progressStatus)}
      </span>
    </span>
  );
}

function renderClassDurationLabel(minutes: number | null | undefined) {
  const full = formatClassDurationLabel(minutes);
  const compact = formatClassDurationLabelCompact(minutes);
  if (!full || !compact) return null;
  return (
    <span className="jp-lesson-class-duration-dt">
      <span className="jp-lesson-class-duration-dt-full">{full}</span>
      <span className="jp-lesson-class-duration-dt-compact">{compact}</span>
    </span>
  );
}

function buildTeacherById(teachers: JpLessonTeacher[]): Map<number, JpLessonTeacher> {
  const map = new Map<number, JpLessonTeacher>();
  for (const teacher of teachers) {
    map.set(teacher.id, teacher);
  }
  return map;
}

type JpLessonMobileIconName =
  | "edit"
  | "calendar"
  | "user"
  | "upload"
  | "clock"
  | "view"
  | "pen"
  | "download"
  | "copy"
  | "notes";

function JpLessonMobileIcon({
  name,
  className = "",
}: {
  name: JpLessonMobileIconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const body = (() => {
    switch (name) {
      case "edit":
      case "pen":
        return <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" {...common} />;
      case "calendar":
        return (
          <>
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.2" {...common} />
            <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" {...common} />
          </>
        );
      case "user":
        return (
          <>
            <circle cx="8" cy="5.5" r="2.2" {...common} />
            <path d="M3.5 13.5c.8-2.2 2.6-3.5 4.5-3.5s3.7 1.3 4.5 3.5" {...common} />
          </>
        );
      case "upload":
        return (
          <>
            <path d="M8 10V3.5M5.5 6 8 3.5 10.5 6" {...common} />
            <path d="M3 12.5h10" {...common} />
          </>
        );
      case "clock":
        return (
          <>
            <circle cx="8" cy="8" r="5.5" {...common} />
            <path d="M8 5v3.5l2.2 1.3" {...common} />
          </>
        );
      case "view":
        return (
          <>
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" {...common} />
            <circle cx="8" cy="8" r="2" {...common} />
          </>
        );
      case "download":
        return (
          <>
            <path d="M8 2.5v7M5.5 7 8 9.5 10.5 7" {...common} />
            <path d="M3 12.5h10" {...common} />
          </>
        );
      case "copy":
        return (
          <>
            <rect x="5.5" y="5.5" width="7" height="7" rx="1" {...common} />
            <path d="M3.5 10.5V4.5a1 1 0 011-1H10" {...common} />
          </>
        );
      case "notes":
        return <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" {...common} />;
      default:
        return null;
    }
  })();
  return (
    <svg
      className={`jp-lesson-mobile-icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

function JpLessonMobileFieldValue({
  icon,
  children,
}: {
  icon: JpLessonMobileIconName;
  children: ReactNode;
}) {
  return (
    <div className="jp-lesson-mobile-field-value">
      <JpLessonMobileIcon name={icon} />
      <span className="jp-lesson-mobile-field-text">{children}</span>
    </div>
  );
}

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
  const [mobileStatusFilter, setMobileStatusFilter] =
    useState<JpLessonProgressStatus>("learning");
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
    viewUrl: string;
  } | null>(null);
  const [sectionSort, setSectionSort] = useState(DEFAULT_JP_LESSON_SECTION_SORT);

  const toggleRecentOperationSort = useCallback((status: JpLessonProgressStatus) => {
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

  const lessonsByStatus = useMemo(() => {
    const buckets: Record<JpLessonProgressStatus, JpLessonRecord[]> = {
      learning: [],
      pending: [],
      completed: [],
    };
    for (const lesson of lessons) {
      buckets[getJpLessonProgressStatus(lesson)].push(lesson);
    }
    return buckets;
  }, [lessons]);

  const displayGroupsByStatus = useMemo(() => {
    const groups: Record<JpLessonProgressStatus, JpLessonDisplayGroup<JpLessonRecord>[]> = {
      learning: groupLessonsForDisplay(lessonsByStatus.learning, sectionSort.learning),
      pending: groupLessonsForDisplay(lessonsByStatus.pending, sectionSort.pending),
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

  const teacherById = useMemo(() => buildTeacherById(teachers), [teachers]);

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
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              completed: optimistic.completed,
              learning: optimistic.learning,
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
        body: JSON.stringify({ lesson_id: lessonId, progress_status: progressStatus }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lesson?: JpLessonRecord;
        error?: string;
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
    } catch (err) {
      if (snapshot) {
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonId ? snapshot : l))
        );
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
        setEditingTeacherLesson(null);
      }
      setStatus("上课老师已更新");
      window.setTimeout(() => setStatus(""), 2500);
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
      setEditingTeacherLesson(null);
      setEditingTeacherLessonIds([]);
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
      setEditingNextClassLesson(null);
      setStatus("上课时间已更新");
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
        const timeData = (await timeRes.json()) as { ok: boolean; error?: string };
        if (!timeData.ok) throw new Error(timeData.error || `课程 #${lessonId} 时间保存失败`);

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
        const teacherData = (await teacherRes.json()) as { ok: boolean; error?: string };
        if (!teacherData.ok) throw new Error(teacherData.error || `课程 #${lessonId} 老师保存失败`);

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
          const progressData = (await progressRes.json()) as { ok: boolean; error?: string };
          if (!progressData.ok) {
            throw new Error(progressData.error || `课程 #${lessonId} 状态保存失败`);
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
      setStatus(`已批量更新 ${batchLessonIds.length} 条未上课教案`);
      setBatchLessonIds([]);
      setBatchModalOpen(false);
      window.setTimeout(() => setStatus(""), 2500);
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
      const viewUrl = refViewUrl(ref.ref_key, ref.updated_at);
      return { lesson, ref, viewUrl };
    });
  };

  const editingRef = editingLesson?.ref_key ? refs[editingLesson.ref_key] : undefined;

  const renderLessonActions = (lesson: JpLessonRecord) => {
    const ref = lesson.ref_key ? refs[lesson.ref_key] : undefined;
    const hasRef = Boolean(lesson.ref_key && ref);
    const viewUrl = lesson.ref_key ? refViewUrl(lesson.ref_key, ref?.updated_at) : "";

    if (!hasRef) {
      return canOperate ? (
        <button
          type="button"
          className="jp-lesson-action-btn"
          onClick={() => setEditingLesson(lesson)}
        >
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <JpLessonMobileIcon name="upload" />
          </span>
          上传教案
        </button>
      ) : (
        <span style={{ color: "var(--muted)" }}>—</span>
      );
    }

    const actionItems: ReactNode[] = [
      <a
        key="view"
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="jp-lesson-action-btn"
      >
        <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
          <JpLessonMobileIcon name="view" />
        </span>
        查看
      </a>,
    ];
    if (ref?.media_type === "image") {
      actionItems.push(
        <button
          key="annotate"
          type="button"
          className="jp-lesson-action-btn"
          onClick={() => setAnnotatingLesson({ lesson, ref: ref!, viewUrl })}
        >
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <JpLessonMobileIcon name="pen" />
          </span>
          随手画
        </button>
      );
    }
    actionItems.push(
      <JpVocabRefDownloadMenu
        key="download"
        downloadUrl={jpVocabRefApiPath(lesson.ref_key!, { download: true })}
        mediaUrl={jpVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })}
        filename={refFilename(lesson, ref)}
        mediaType={ref?.media_type ?? "image"}
        primaryClassName="jp-lesson-action-btn jp-lesson-action-btn--download"
        fixedPanel
        allowOriginalDownload={isAdmin}
      />
    );
    actionItems.push(
      <JpLessonCopyMenu
        key="copy"
        lessonId={lesson.id}
        viewUrl={viewUrl}
        siteUrl={JP_SITE_URL}
        copyCount={lesson.link_copy_count ?? 0}
        primaryClassName="jp-lesson-action-btn"
        fixedPanel
        copiedId={copiedId}
        onCopied={handleLessonLinkCopied}
        onCopyError={handleLessonLinkCopyError}
        icon={
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <JpLessonMobileIcon name="copy" />
          </span>
        }
      />
    );
    if (canOperate) {
      actionItems.push(
        <JpEditIconButton
          key="edit"
          title="编辑教案（弹窗）"
          onClick={() => setEditingLesson(lesson)}
        />
      );
    }
    return <div className="jp-lesson-actions">{actionItems}</div>;
  };

  const renderMobileCardFooter = (groupLessons: JpLessonRecord[]) => {
    const rows = groupLessons.flatMap((lesson) => {
      const buttons: ReactNode[] = [];
      if (canOperate) {
        buttons.push(
          <button
            key={`edit-${lesson.id}`}
            type="button"
            className="jp-lesson-mobile-footer-btn"
            onClick={() => setEditingLesson(lesson)}
          >
            <JpLessonMobileIcon name="edit" />
            <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}编辑课程</span>
          </button>
        );
      }
      if (isAdmin) {
        buttons.push(
          <button
            key={`time-${lesson.id}`}
            type="button"
            className="jp-lesson-mobile-footer-btn"
            disabled={savingNextClassId === lesson.id}
            onClick={() => openNextClassEditModal(lesson)}
          >
            <JpLessonMobileIcon name="clock" />
            <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}修改时间</span>
          </button>
        );
        buttons.push(
          <button
            key={`teacher-${lesson.id}`}
            type="button"
            className="jp-lesson-mobile-footer-btn"
            onClick={() => openTeacherEditModal(lesson)}
          >
            <JpLessonMobileIcon name="user" />
            <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}修改老师</span>
          </button>
        );
      }
      if (!buttons.length) return [];
      return (
        <div
          key={lesson.id}
          className="jp-lesson-mobile-footer-row"
          style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}
        >
          {buttons}
        </div>
      );
    });

    if (!rows.length) {
      return <td className="jp-lesson-mobile-card-footer" aria-hidden="true" />;
    }

    return (
      <td className="jp-lesson-mobile-card-footer">
        <div className="jp-lesson-mobile-footer-stack">{rows}</div>
      </td>
    );
  };

  const renderSharedTeacherCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    const batchKey = `group-${groupLessons.map((item) => item.id).join("-")}`;
    const batchCopyItems = groupLessons
      .map((item) => {
        if (!item.ref_key) return null;
        const ref = refs[item.ref_key];
        if (!ref) return null;
        return {
          lessonId: item.id,
          content: formatLessonContentOneLine(item.content),
          viewUrl: refViewUrl(item.ref_key, ref.updated_at),
        };
      })
      .filter((item): item is { lessonId: number; content: string; viewUrl: string } => item != null);
    return (
      <td data-label="上课老师" className="jp-lesson-teacher-col">
        <div className="jp-lesson-teacher-cell">
          <JpLessonMobileFieldValue icon="user">
            <JpLessonTeacherDisplay lesson={lesson} teachersById={teacherById} />
          </JpLessonMobileFieldValue>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.length > 1 ? (
              <JpLessonBatchCopyMenu
                batchKey={batchKey}
                items={batchCopyItems}
                siteUrl={JP_SITE_URL}
                primaryClassName="jp-lesson-action-btn"
                fixedPanel
                copiedBatchKey={copiedBatchKey}
                onCopied={handleBatchLinkCopied}
                onCopyError={handleLessonLinkCopyError}
              />
            ) : null}
            <JpEditIconButton
              title={
                groupLessons.length > 1
                  ? `设置该合并行上课老师（共 ${groupLessons.length} 条）`
                  : `设置 #${lesson.id} 上课老师`
              }
              onClick={() => openTeacherEditModal(lesson, groupLessons.map((item) => item.id))}
            />
          </div>
        </div>
      </td>
    );
  };

  const renderSharedClassTimeCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    const progressStatus = getJpLessonProgressStatus(lesson);
    const classSchedules = getLessonClassSchedules(lesson);

    return (
      <td data-label="上课时间" className="jp-lesson-next-class-col">
        <div className="jp-lesson-next-class-cell">
          <JpLessonMobileFieldValue icon="calendar">
            <div className="jp-lesson-next-class-lines">
            {progressStatus === "completed" ? (
              <span className="jp-lesson-next-class-label is-done">已上完课</span>
            ) : classSchedules.length === 0 ? (
              <span className="jp-lesson-next-class-label is-undefined">未定义</span>
            ) : (
              classSchedules.map((schedule, scheduleIdx) => {
                const durationLabel = renderClassDurationLabel(schedule.duration_minutes);
                return (
                  <div
                    key={schedule.id || scheduleIdx}
                    className="jp-lesson-next-class-entry"
                  >
                    <span className="jp-lesson-next-class-label">
                      {renderNextClassLabel(schedule.class_at, progressStatus)}
                    </span>
                    {durationLabel ? (
                      <span className="jp-lesson-class-duration-label">{durationLabel}</span>
                    ) : null}
                  </div>
                );
              })
            )}
            </div>
          </JpLessonMobileFieldValue>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <JpEditIconButton
                key={item.id}
                title={`设置 #${item.id} 上课时间`}
                disabled={savingNextClassId === item.id}
                onClick={() => openNextClassEditModal(item)}
              />
            ))}
          </div>
        </div>
      </td>
    );
  };

  const renderLessonTable = (
    displayGroups: JpLessonDisplayGroup<JpLessonRecord>[],
    status: JpLessonProgressStatus,
    dayToneByDate?: Map<string, number>
  ) => {
    const sort = sectionSort[status];
    const recentOperationSorted = sort.field === "recentOperation";
    const classTimeSorted = sort.field === "classTime";

    return (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>学习类型</th>
            <th>学习内容</th>
            <th className="jp-lesson-content-count-col" title="按英文/中文逗号分隔统计">
              词/语法数
            </th>
            <th>释义</th>
            <th className="jp-lesson-examples-col">例句</th>
            <th className="jp-lesson-uploaded-col">上传日期</th>
            <th
              className={`jp-lesson-status-at-col jp-lesson-status-at-col--sortable${
                recentOperationSorted
                  ? sort.order === "asc"
                    ? " jp-lesson-status-at-col--sorted-asc"
                    : " jp-lesson-status-at-col--sorted-desc"
                  : ""
              }`}
            >
              <button
                type="button"
                className="jp-lesson-sort-btn"
                title={
                  recentOperationSorted
                    ? sort.order === "desc"
                      ? "按最近操作从新到旧排序；点击切换为从旧到新"
                      : "按最近操作从旧到新排序；点击切换为从新到旧"
                    : "按最近操作排序；点击后最近一次操作的排在前面"
                }
                aria-label={
                  recentOperationSorted
                    ? sort.order === "desc"
                      ? "最近操作降序，点击切换为升序"
                      : "最近操作升序，点击切换为降序"
                    : "按最近操作排序"
                }
                onClick={() => toggleRecentOperationSort(status)}
              >
                最近操作
                {recentOperationSorted ? (
                  <span className="jp-lesson-sort-indicator" aria-hidden="true">
                    {sort.order === "asc" ? "↑" : "↓"}
                  </span>
                ) : null}
              </button>
            </th>
            <th className="jp-lesson-operator-col">操作人</th>
            {isAdmin ? <th className="jp-lesson-teacher-col">上课老师</th> : null}
            {isAdmin ? (
              <th
                className={`jp-lesson-next-class-col jp-lesson-next-class-col--sortable${
                  classTimeSorted
                    ? sort.order === "asc"
                      ? " jp-lesson-next-class-col--sorted-asc"
                      : " jp-lesson-next-class-col--sorted-desc"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="jp-lesson-sort-btn"
                  title={
                    classTimeSorted
                      ? sort.order === "asc"
                        ? "按上课时间从早到晚排序；点击切换为从晚到早。同一老师同一时段的多条教材会合并为一行"
                        : "按上课时间从晚到早排序；点击切换为从早到晚。同一老师同一时段的多条教材会合并为一行"
                      : "按上课时间排序；点击后按上课时间从早到晚排列。同一老师同一时段的多条教材会合并为一行"
                  }
                  aria-label={
                    classTimeSorted
                      ? sort.order === "asc"
                        ? "上课时间升序，点击切换为降序"
                        : "上课时间降序，点击切换为升序"
                      : "按上课时间排序"
                  }
                  onClick={() => toggleClassTimeSort(status)}
                >
                  上课时间
                  {classTimeSorted ? (
                    <span className="jp-lesson-sort-indicator" aria-hidden="true">
                      {sort.order === "asc" ? "↑" : "↓"}
                    </span>
                  ) : null}
                </button>
              </th>
            ) : null}
            <th className="jp-lesson-complete-col">学习状态</th>
            <th className="jp-lesson-notes-col">课堂笔记</th>
            <th className="jp-lesson-actions-col">教案操作</th>
          </tr>
        </thead>
        <tbody>
          {displayGroups.map((group) => {
            const merged = group.lessons.length > 1;
            const stackClass = merged ? " jp-lesson-merged-stack" : "";
            const classDate = getLessonClassDate(group.lessons[0]);
            const dayTone =
              classDate != null ? dayToneByDate?.get(classDate) : undefined;
            const rowClassName = [
              "jp-lesson-row",
              merged ? "jp-lesson-row--merged" : "",
              dayTone != null ? `jp-lesson-row--day-tone-${dayTone}` : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <tr key={group.key} className={rowClassName || undefined}>
                <td data-label="ID" className="jp-lesson-id-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <label className="jp-lesson-batch-id-row">
                          {isAdmin && getJpLessonProgressStatus(lesson) === "pending" ? (
                            <input
                              type="checkbox"
                              checked={batchLessonIds.includes(lesson.id)}
                              onChange={() => toggleBatchLesson(lesson.id)}
                              aria-label={`勾选课程 #${lesson.id} 批量设置`}
                            />
                          ) : (
                            <span className="jp-lesson-batch-id-placeholder" aria-hidden="true" />
                          )}
                          <span>{lesson.id}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="学习类型" className="jp-lesson-kind-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <span
                          className={`jp-lesson-kind${
                            lesson.kind === "grammar" ? " jp-lesson-kind--grammar" : ""
                          }`}
                        >
                          {lesson.kind === "grammar" ? "语法" : "单词"}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="学习内容" className="jp-lesson-content-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <div className="jp-lesson-content-lines jp-lesson-content-desktop">
                          {formatLessonContentLines(lesson.content).map((line, lineIdx) => (
                            <span key={lineIdx} className="jp-lesson-content-line">
                              {line}
                            </span>
                          ))}
                        </div>
                        <div
                          className={`jp-lesson-mobile-content-item${
                            merged ? " jp-lesson-merged-stack-item" : ""
                          }`}
                        >
                          <div className="jp-lesson-mobile-content-main">
                            <div className="jp-lesson-mobile-id-block">
                              <div className="jp-lesson-mobile-id-line">
                                <span className="jp-lesson-mobile-id-label">ID</span>
                                <span className="jp-lesson-mobile-id-value">{lesson.id}</span>
                              </div>
                              <span
                                className={`jp-lesson-kind jp-lesson-mobile-kind-tag${
                                  lesson.kind === "grammar" ? " jp-lesson-kind--grammar" : ""
                                }`}
                              >
                                {lesson.kind === "grammar" ? "语法" : "单词"}
                              </span>
                            </div>
                            <p className="jp-lesson-mobile-content-text">
                              {formatLessonContentOneLine(lesson.content)}
                            </p>
                            <p className="jp-lesson-mobile-meanings-inline">
                              <span className="jp-lesson-mobile-meanings-label">释义</span>
                              {formatLessonMeaningsOneLine(lesson.content, lesson.meanings)}
                            </p>
                            <p className="jp-lesson-mobile-examples-inline">
                              <span className="jp-lesson-mobile-examples-label">例句</span>
                              {formatLessonExamplesOneLine(
                                lesson.content,
                                lesson.example_sentences
                              )}
                            </p>
                            {canOperate ? (
                              <button
                                type="button"
                                className="jp-lesson-mobile-content-edit"
                                title={`编辑 #${lesson.id} 教案`}
                                aria-label={`编辑 #${lesson.id} 教案`}
                                onClick={() => setEditingLesson(lesson)}
                              >
                                <JpLessonMobileIcon name="edit" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="词/语法数" className="jp-lesson-content-count-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {parseLessonContent(lesson.content).length}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="释义" className="jp-lesson-meanings-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <div className="jp-lesson-meanings-lines jp-lesson-meanings-desktop">
                          {formatLessonMeaningsLines(lesson.content, lesson.meanings).map(
                            (line, lineIdx) => (
                              <span key={lineIdx} className="jp-lesson-meanings-line">
                                {line}
                              </span>
                            )
                          )}
                        </div>
                        <p className="jp-lesson-mobile-meanings-text">
                          {formatLessonMeaningsOneLine(lesson.content, lesson.meanings)}
                        </p>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="例句" className="jp-lesson-examples-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <div className="jp-lesson-examples-desktop">
                          {formatLessonExamplesOneLine(
                            lesson.content,
                            lesson.example_sentences
                          )}
                        </div>
                        <p className="jp-lesson-mobile-examples-text">
                          {formatLessonExamplesOneLine(
                            lesson.content,
                            lesson.example_sentences
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="upload">
                          {renderLessonDateTime(lesson.uploaded_at)}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="clock">
                          {lesson.status_updated_at
                            ? renderLessonDateTime(lesson.status_updated_at)
                            : "—"}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="user">
                          {lesson.status_updated_by ?? "—"}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                {isAdmin ? renderSharedTeacherCell(group.lessons) : null}
                {isAdmin ? renderSharedClassTimeCell(group.lessons) : null}
                <td data-label="学习状态" className="jp-lesson-complete-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const progressStatus = getJpLessonProgressStatus(lesson);
                      return (
                        <div
                          key={lesson.id}
                          className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        >
                          <div
                            className={`jp-lesson-complete-wrap${
                              progressStatus === "completed" ? " is-done" : ""
                            }${progressStatus === "learning" ? " is-learning" : ""}${
                              !canOperate ? " is-readonly" : ""
                            }${savingId === lesson.id ? " is-saving" : ""}`}
                          >
                            <select
                              className="jp-lesson-complete-select"
                              value={progressStatus}
                              disabled={!canOperate || savingId === lesson.id}
                              aria-label={`${lesson.content} 学习状态`}
                              onChange={(e) =>
                                void setLessonProgress(
                                  lesson.id,
                                  e.target.value as JpLessonProgressStatus
                                )
                              }
                            >
                              <option value="pending">未完成</option>
                              <option value="learning">学习中</option>
                              <option value="completed">已完成</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="课堂笔记" className="jp-lesson-notes-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const noteCount = noteCountByLesson.get(lesson.id) ?? 0;
                      return (
                        <div
                          key={lesson.id}
                          className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        >
                          <a
                            href={`/jp-lesson/notes?id=${lesson.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="jp-lesson-notes-btn"
                            title="在新标签页打开课堂笔记"
                          >
                            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                              <JpLessonMobileIcon name="notes" />
                            </span>
                            笔记
                            {noteCount > 0 ? (
                              <span className="jp-lesson-notes-count">{noteCount}</span>
                            ) : null}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="教案操作" className="jp-lesson-actions-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        {renderLessonActions(lesson)}
                      </div>
                    ))}
                  </div>
                </td>
                {renderMobileCardFooter(group.lessons)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    );
  };

  return (
    <main
      className="page-wrap jp-lesson-page jp-lesson-page--ja"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
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

      {loading ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : !lessons.length ? (
        <section className="section etr-panel" aria-label="学习清单">
          <p style={{ color: "var(--muted)", margin: 0 }}>暂无新课，请通过 API 上传。</p>
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
                  renderLessonTable(
                    sectionGroups,
                    status,
                    status === "learning" ? learningDayToneByDate : undefined
                  )
                ) : (
                  <p className="jp-lesson-status-card-empty">{emptyHint}</p>
                )}
              </section>
            );
          })}
        </div>
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
        imageUrl={annotatingLesson?.viewUrl ?? ""}
        refKey={annotatingLesson?.lesson.ref_key ?? ""}
        lessonId={annotatingLesson?.lesson.id ?? 0}
        lessonContent={annotatingLesson?.lesson.content ?? ""}
        locale={locale}
        canSave={canOperate}
        onClose={() => setAnnotatingLesson(null)}
        onSaved={handleAnnotateSaved}
        onNeedAuth={openJpAuth}
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

      <style jsx>{`
        :global(.page-wrap:has(.jp-lesson-page)) {
          max-width: min(1480px, 96vw);
        }
        .jp-lesson-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .jp-lesson-admin-links {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.25rem;
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }
        .jp-lesson-status-card {
          margin: 0;
        }
        .jp-lesson-status-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .jp-lesson-batch-toolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          margin: -0.25rem 0 0.75rem;
        }
        .jp-lesson-status-card-title {
          font-size: 1.375rem;
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .jp-lesson-status-card-count {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-lesson-status-card-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-lesson-status-card--learning {
          border-left: 3px solid color-mix(in srgb, var(--accent) 70%, var(--border));
        }
        .jp-lesson-status-card--learning .jp-lesson-status-card-title {
          color: var(--accent);
        }
        .jp-lesson-status-card--pending {
          border-left: 3px solid var(--border);
        }
        .jp-lesson-status-card--completed {
          border-left: 3px solid color-mix(in srgb, var(--fall) 70%, var(--border));
        }
        .jp-lesson-status-card--completed .jp-lesson-status-card-title {
          color: var(--fall);
        }
        :global(.jp-lesson-table-wrap) {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        :global(.jp-lesson-table) {
          width: 100%;
        }
        @media (min-width: 768px) {
          :global(.jp-lesson-table) {
            min-width: 640px;
          }
          :global(.jp-lesson-mobile-status-filter) {
            display: none;
          }
        }
        :global(.jp-lesson-mobile-card-head),
        :global(.jp-lesson-mobile-card-footer) {
          display: none !important;
        }
        :global(.jp-lesson-mobile-field-value) {
          display: contents;
        }
        :global(.jp-lesson-mobile-icon),
        :global(.jp-lesson-mobile-btn-icon),
        :global(.jp-lesson-mobile-content-item) {
          display: none;
        }
        :global(.jp-lesson-content-desktop) {
          display: flex;
        }
        :global(.jp-lesson-table th),
        :global(.jp-lesson-table td) {
          vertical-align: middle;
          padding: 0.6rem 0.75rem;
          white-space: normal;
        }
        :global(.jp-lesson-id-col) {
          width: 3.25rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          text-align: center;
        }
        :global(.jp-lesson-content-col) {
          min-width: 9rem;
          max-width: 14rem;
        }
        :global(.jp-lesson-content-count-col) {
          width: 4.5rem;
          min-width: 4.5rem;
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-meanings-col) {
          min-width: 8rem;
          max-width: 16rem;
          color: var(--muted);
        }
        :global(.jp-lesson-examples-col) {
          min-width: 10rem;
          max-width: 22rem;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-word;
        }
        :global(.jp-lesson-meanings-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          line-height: 1.45;
        }
        :global(.jp-lesson-meanings-line) {
          display: block;
        }
        :global(.jp-lesson-mobile-meanings-text),
        :global(.jp-lesson-mobile-examples-text) {
          display: none;
        }
        :global(.jp-lesson-mobile-meanings-inline),
        :global(.jp-lesson-mobile-examples-inline) {
          display: none;
        }
        :global(.jp-lesson-content-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          line-height: 1.45;
        }
        :global(.jp-lesson-content-line) {
          display: block;
        }
        :global(.jp-lesson-merged-stack) {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        :global(.jp-lesson-merged-stack-item + .jp-lesson-merged-stack-item) {
          margin-top: 0.65rem;
          padding-top: 0.65rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
        }
        :global(.jp-lesson-row--merged) {
          background: color-mix(in srgb, var(--accent) 4%, transparent);
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-0) {
          background: color-mix(in srgb, #c9b86a 10%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-1) {
          background: color-mix(in srgb, var(--fall) 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-2) {
          background: color-mix(in srgb, #6ab8c8 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-3) {
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-4) {
          background: color-mix(in srgb, #9a8fbf 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-5) {
          background: color-mix(in srgb, #c8a882 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-0:hover) {
          background: color-mix(in srgb, #c9b86a 13%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-1:hover) {
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-2:hover) {
          background: color-mix(in srgb, #6ab8c8 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-3:hover) {
          background: color-mix(in srgb, var(--accent) 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-4:hover) {
          background: color-mix(in srgb, #9a8fbf 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-5:hover) {
          background: color-mix(in srgb, #c8a882 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-0) {
          background: color-mix(in srgb, #c9b86a 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-1) {
          background: color-mix(in srgb, var(--fall) 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-2) {
          background: color-mix(in srgb, #6ab8c8 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-3) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-4) {
          background: color-mix(in srgb, #9a8fbf 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-5) {
          background: color-mix(in srgb, #c8a882 11%, var(--panel));
        }
        :global(.jp-lesson-merged-edit-stack) {
          display: inline-flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        :global(.jp-lesson-dt-compact) {
          display: none;
        }
        :global(.jp-lesson-next-class-dt-compact),
        :global(.jp-lesson-class-duration-dt-compact) {
          display: none;
        }
        @media (max-width: 767px) {
          :global(.jp-lesson-page--ja .jp-lesson-dt-full),
          :global(.jp-lesson-page--ja .jp-lesson-next-class-dt-full),
          :global(.jp-lesson-page--ja .jp-lesson-class-duration-dt-full) {
            display: none !important;
          }
          :global(.jp-lesson-page--ja .jp-lesson-dt-compact),
          :global(.jp-lesson-page--ja .jp-lesson-next-class-dt-compact),
          :global(.jp-lesson-page--ja .jp-lesson-class-duration-dt-compact) {
            display: inline !important;
          }
          :global(.jp-lesson-page--ja .jp-lesson-meanings-col),
          :global(.jp-lesson-page--ja .jp-lesson-examples-col) {
            display: none !important;
          }
          :global(.jp-lesson-page--ja .jp-lesson-mobile-meanings-inline),
          :global(.jp-lesson-page--ja .jp-lesson-mobile-examples-inline) {
            display: block;
            margin: 0.35rem 0 0;
            font-size: 0.8125rem;
            line-height: 1.45;
            color: var(--muted);
          }
          :global(.jp-lesson-page--ja .jp-lesson-mobile-meanings-label),
          :global(.jp-lesson-page--ja .jp-lesson-mobile-examples-label) {
            margin-right: 0.35rem;
            color: var(--text);
            font-weight: 500;
          }
        }
        :global(.jp-lesson-uploaded-col),
        :global(.jp-lesson-status-at-col) {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
        }
        :global(.jp-lesson-status-at-col--sortable) {
          padding: 0;
        }
        :global(.jp-lesson-operator-col) {
          white-space: nowrap;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-teacher-col) {
          font-size: 0.8125rem;
          min-width: 5.5rem;
        }
        :global(.jp-lesson-teacher-cell) {
          display: inline-flex;
          align-items: flex-start;
          gap: 0.35rem;
        }
        :global(.jp-lesson-next-class-col) {
          font-size: 0.8125rem;
          min-width: 7.5rem;
        }
        :global(.jp-lesson-next-class-col--sortable) {
          padding: 0;
        }
        :global(.jp-lesson-sort-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          width: 100%;
          min-height: 2.5rem;
          padding: 0.6rem 0.75rem;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.15s ease, background 0.15s ease;
        }
        :global(.jp-lesson-sort-btn:hover) {
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 8%, transparent);
        }
        :global(.jp-lesson-sort-btn:focus-visible) {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: -2px;
        }
        :global(.jp-lesson-next-class-col--sorted-asc .jp-lesson-sort-btn),
        :global(.jp-lesson-next-class-col--sorted-desc .jp-lesson-sort-btn),
        :global(.jp-lesson-status-at-col--sorted-asc .jp-lesson-sort-btn),
        :global(.jp-lesson-status-at-col--sorted-desc .jp-lesson-sort-btn) {
          color: var(--accent);
        }
        :global(.jp-lesson-sort-indicator) {
          font-size: 0.75rem;
          line-height: 1;
          opacity: 0.9;
        }
        :global(.jp-lesson-next-class-cell) {
          display: inline-flex;
          align-items: flex-start;
          gap: 0.35rem;
        }
        :global(.jp-lesson-next-class-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          line-height: 1.35;
        }
        :global(.jp-lesson-next-class-entry) {
          display: flex;
          flex-direction: column;
          gap: 0.08rem;
        }
        :global(.jp-lesson-next-class-label) {
          color: var(--accent);
          white-space: nowrap;
        }
        :global(.jp-lesson-class-duration-label) {
          color: var(--muted);
          font-size: 0.75rem;
          white-space: nowrap;
        }
        :global(.jp-lesson-next-class-label.is-undefined) {
          color: var(--muted);
        }
        :global(.jp-lesson-next-class-label.is-done) {
          color: var(--fall);
        }
        :global(.jp-lesson-actions-col) {
          text-align: center;
        }
        :global(.jp-lesson-notes-col) {
          text-align: center;
        }
        :global(.jp-lesson-notes-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
          text-decoration: none;
        }
        :global(.jp-lesson-notes-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          text-decoration: none;
        }
        :global(.jp-lesson-notes-count) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.15rem;
          height: 1.15rem;
          padding: 0 0.25rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--accent);
          font-size: 0.6875rem;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-lesson-kind) {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        :global(.jp-lesson-kind--grammar) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
        :global(.jp-lesson-complete-col) {
          text-align: center;
        }
        :global(.jp-lesson-complete-wrap) {
          position: relative;
          display: inline-flex;
          align-items: center;
          margin: 0 auto;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }
        :global(.jp-lesson-complete-wrap.is-done) {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap.is-learning) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        :global(.jp-lesson-complete-wrap.is-done:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--fall) 65%, var(--border));
          background: color-mix(in srgb, var(--fall) 16%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 22%, transparent);
        }
        :global(.jp-lesson-complete-wrap::after) {
          content: "";
          position: absolute;
          right: 0.55rem;
          top: 50%;
          width: 0.45rem;
          height: 0.45rem;
          border-right: 1.5px solid currentColor;
          border-bottom: 1.5px solid currentColor;
          transform: translateY(-65%) rotate(45deg);
          pointer-events: none;
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-readonly) {
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-saving) {
          opacity: 0.55;
        }
        :global(.jp-lesson-complete-select) {
          display: block;
          min-height: 2rem;
          width: 6.5rem;
          min-width: 6.5rem;
          max-width: 100%;
          padding: 0.25rem 1.35rem 0.25rem 0.45rem;
          font-size: 0.8125rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: center;
          text-align-last: center;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        :global(.jp-lesson-complete-select:focus-visible) {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        :global(.jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-complete-wrap.is-readonly .jp-lesson-complete-select:disabled),
        :global(.jp-lesson-complete-wrap.is-saving .jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-actions) {
          display: grid;
          grid-template-columns: repeat(3, max-content);
          justify-content: center;
          align-items: center;
          gap: 0.35rem;
        }
        :global(.jp-lesson-action-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          text-decoration: none;
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
        }
        :global(.jp-lesson-action-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.jp-lesson-batch-id-row) {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        :global(.jp-lesson-batch-id-placeholder) {
          display: inline-block;
          width: 14px;
          height: 14px;
        }
      `}</style>
    </main>
  );
}
