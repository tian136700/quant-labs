"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnLessonAnnotateModal } from "@/components/EnLessonAnnotateModal";
import { EnLessonCopyMenu } from "@/components/EnLessonCopyMenu";
import { EnLessonNextClassEditModal } from "@/components/EnLessonNextClassEditModal";
import {
  EnLessonTeacherEditModal,
  type EnLessonTeacherUpdateInput,
} from "@/components/EnLessonTeacherEditModal";
import { EnVocabRefDownloadMenu } from "@/components/EnVocabRefDownloadMenu";
import { EnVocabRefEditModal } from "@/components/EnVocabRefEditModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime, formatBeijingDateTimeCompact } from "@/lib/format-datetime";
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
  buildEnLessonDisplayGroups,
  buildLearningClassDayToneMap,
  formatClassDurationLabel,
  formatClassDurationLabelCompact,
  formatLessonContentLines,
  parseLessonContent,
  formatNextClassAtLabel,
  formatNextClassAtLabelCompact,
  getEnLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  enLessonProgressToFields,
  normalizeClassDurationMinutes,
  type EnLessonDisplayGroup,
  type EnLessonClassTimeSortOrder,
  type EnLessonProgressStatus,
} from "@/lib/en-lesson-shared";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  enLessonSchedulePath,
} from "@/lib/locale-path";
import {
  enLessonRefDownloadFilename,
  enVocabRefApiPath,
  enVocabRefViewerPath,
} from "@/lib/en-vocab-ref-shared";
import { SITE_URL } from "@/lib/site";
import type {
  EnLessonClassScheduleInput,
  EnLessonNote,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
} from "@/lib/types";

function readLessonCache(): EnLessonApiPayload | null {
  return readClientCache<EnLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

function persistLessonCache(
  lessons: EnLessonRecord[],
  refs: Record<string, EnVocabRef>,
  notes: EnLessonNote[],
  teachers?: EnLessonTeacher[]
) {
  writeClientCache(JP_LESSON_CACHE_KEY, { lessons, refs, notes, teachers });
}

function refViewUrl(refKey: string, updatedAt?: string | null): string {
  return enVocabRefViewerPath(refKey, updatedAt);
}

const LESSON_STATUS_SECTIONS: {
  status: EnLessonProgressStatus;
  title: string;
  emptyHint: string;
}[] = [
  { status: "learning", title: "学习中", emptyHint: "暂无学习中的新课" },
  { status: "pending", title: "未完成", emptyHint: "暂无未完成的新课" },
  { status: "completed", title: "已完成", emptyHint: "暂无已完成的新课" },
];

function groupLessonsForDisplay(
  lessons: EnLessonRecord[],
  classTimeSortOrder: EnLessonClassTimeSortOrder
): EnLessonDisplayGroup<EnLessonRecord>[] {
  return buildEnLessonDisplayGroups(lessons, classTimeSortOrder);
}

function refFilename(lesson: EnLessonRecord, ref?: EnVocabRef): string {
  const mediaType = ref?.media_type === "pdf" ? "pdf" : "image";
  return enLessonRefDownloadFilename(lesson, mediaType);
}

const EN_LESSON_CONTENT_PREVIEW_LINES = 2;
/** 折叠时最多展示的词/短语条数（约两行 × 每行 3 个） */
const EN_LESSON_CONTENT_PREVIEW_ITEMS = 6;

function EnLessonContentPreview({
  content,
  expanded,
  onToggle,
}: {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const items = parseLessonContent(content);
  const lines = formatLessonContentLines(content);
  const needsMore =
    lines.length > EN_LESSON_CONTENT_PREVIEW_LINES ||
    items.length > EN_LESSON_CONTENT_PREVIEW_ITEMS;
  const shown =
    !expanded && needsMore ? lines.slice(0, EN_LESSON_CONTENT_PREVIEW_LINES) : lines;

  return (
    <div
      className={`jp-lesson-content-preview${expanded ? " is-expanded" : ""}${
        needsMore && !expanded ? " is-clamped" : ""
      }`}
    >
      <div className="jp-lesson-content-lines jp-lesson-content-desktop">
        {shown.map((line, lineIdx) => (
          <span key={lineIdx} className="jp-lesson-content-line">
            {line}
          </span>
        ))}
      </div>
      {needsMore ? (
        <button
          type="button"
          className="jp-lesson-content-more-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "更多"}
        </button>
      ) : null}
    </div>
  );
}

type EnLessonMobileIconName =
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

function EnLessonMobileIcon({
  name,
  className = "",
}: {
  name: EnLessonMobileIconName;
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

function EnLessonMobileFieldValue({
  icon,
  children,
}: {
  icon: EnLessonMobileIconName;
  children: ReactNode;
}) {
  return (
    <div className="jp-lesson-mobile-field-value">
      <EnLessonMobileIcon name={icon} />
      <span className="jp-lesson-mobile-field-text">{children}</span>
    </div>
  );
}

function renderLessonDateTime(iso: string) {
  const full = formatBeijingDateTime(iso);
  const spaceIdx = full.lastIndexOf(" ");
  const datePart = spaceIdx > 0 ? full.slice(0, spaceIdx) : full;
  const timePart = spaceIdx > 0 ? full.slice(spaceIdx + 1) : "";
  return (
    <span className="jp-lesson-dt">
      <span className="jp-lesson-dt-full jp-lesson-dt-stacked">
        <span className="jp-lesson-dt-date">{datePart}</span>
        {timePart ? <span className="jp-lesson-dt-time">{timePart}</span> : null}
      </span>
      <span className="jp-lesson-dt-compact">{formatBeijingDateTimeCompact(iso)}</span>
    </span>
  );
}

function renderNextClassLabel(classAt: string, progressStatus: EnLessonProgressStatus) {
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

function formatLessonTeacherNames(
  lesson: EnLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? []).map(
    (id) => teacherNameById.get(id) || `#${id}`
  );
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "—";
}

/** 复制「仅文字」用：无上课老师时返回空串，由复制模板留两个空格 */
function formatLessonTeacherNamesForCopy(
  lesson: EnLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => teacherNameById.get(id)?.trim() || "")
    .filter(Boolean);
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.join("、");
}

function mergeEnLessonTeachers(
  primary: EnLessonTeacher[],
  updates: EnLessonTeacher[]
): EnLessonTeacher[] {
  const map = new Map(primary.map((teacher) => [teacher.id, teacher]));
  for (const teacher of updates) {
    map.set(teacher.id, teacher);
  }
  return [...map.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id
  );
}

export function EnLessonPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessEnVocab, openAuthPanel, isAdmin } = useEtrAuth();
  const canOperate = canAccessEnVocab;

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
    viewUrl: string;
  } | null>(null);
  const [expandedContentIds, setExpandedContentIds] = useState<Record<number, boolean>>({});
  const [classTimeSortOrder, setClassTimeSortOrder] =
    useState<EnLessonClassTimeSortOrder>("asc");

  const toggleContentExpanded = useCallback((lessonId: number) => {
    setExpandedContentIds((prev) => ({
      ...prev,
      [lessonId]: !prev[lessonId],
    }));
  }, []);

  const toggleClassTimeSortOrder = useCallback(() => {
    setClassTimeSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
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
    void loadLessons();
  }, [loadLessons]);

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

  const displayGroupsByStatus = useMemo(() => {
    const groups: Record<EnLessonProgressStatus, EnLessonDisplayGroup<EnLessonRecord>[]> = {
      learning: groupLessonsForDisplay(lessonsByStatus.learning, classTimeSortOrder),
      pending: groupLessonsForDisplay(lessonsByStatus.pending, classTimeSortOrder),
      completed: groupLessonsForDisplay(lessonsByStatus.completed, classTimeSortOrder),
    };
    return groups;
  }, [lessonsByStatus, classTimeSortOrder]);

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

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [teachers]);

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

  const addLessonTeacher = async (name: string): Promise<EnLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/en-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
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
      scrollLessonListItemIntoView(lessonId);
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
      const viewUrl = refViewUrl(ref.ref_key, ref.updated_at);
      return { lesson, ref, viewUrl };
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

  const renderLessonDeleteButton = (lesson: EnLessonRecord) =>
    canOperate ? (
      <button
        key="delete"
        type="button"
        className="jp-lesson-action-btn jp-lesson-action-btn--danger"
        disabled={deletingId === lesson.id}
        onClick={() => void deleteLesson(lesson)}
      >
        {deletingId === lesson.id ? "删除中…" : "删除"}
      </button>
    ) : null;

  const editingRef = editingLesson?.ref_key ? refs[editingLesson.ref_key] : undefined;

  const renderLessonActions = (lesson: EnLessonRecord) => {
    const ref = lesson.ref_key ? refs[lesson.ref_key] : undefined;
    const hasRef = Boolean(lesson.ref_key && ref);
    const viewUrl = lesson.ref_key ? refViewUrl(lesson.ref_key, ref?.updated_at) : "";

    if (!hasRef) {
      return canOperate ? (
        <div className="jp-lesson-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            onClick={() => setEditingLesson(lesson)}
          >
            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
              <EnLessonMobileIcon name="upload" />
            </span>
            上传教案
          </button>
          {renderLessonDeleteButton(lesson)}
        </div>
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
          <EnLessonMobileIcon name="view" />
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
            <EnLessonMobileIcon name="pen" />
          </span>
          随手画
        </button>
      );
    }
    actionItems.push(
      <EnVocabRefDownloadMenu
        key="download"
        downloadUrl={enVocabRefApiPath(lesson.ref_key!, { download: true })}
        mediaUrl={enVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })}
        filename={refFilename(lesson, ref)}
        mediaType={ref?.media_type ?? "image"}
        primaryClassName="jp-lesson-action-btn jp-lesson-action-btn--download"
        fixedPanel
        allowOriginalDownload={isAdmin}
        cropKind={lesson.kind}
      />
    );
    actionItems.push(
      <EnLessonCopyMenu
        key="copy"
        lessonId={lesson.id}
        viewUrl={viewUrl}
        siteUrl={SITE_URL}
        teacherNames={formatLessonTeacherNamesForCopy(lesson, teacherNameById)}
        copyCount={lesson.link_copy_count ?? 0}
        primaryClassName="jp-lesson-action-btn"
        fixedPanel
        copiedId={copiedId}
        onCopied={handleLessonCopied}
        onCopyError={handleLessonCopyError}
        icon={
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <EnLessonMobileIcon name="copy" />
          </span>
        }
      />
    );
    if (canOperate) {
      actionItems.push(
        <EnEditIconButton
          key="edit"
          title="编辑教案（弹窗）"
          onClick={() => setEditingLesson(lesson)}
        />
      );
      const deleteBtn = renderLessonDeleteButton(lesson);
      if (deleteBtn) actionItems.push(deleteBtn);
    }
    return <div className="jp-lesson-actions">{actionItems}</div>;
  };

  const renderMobileCardFooter = (groupLessons: EnLessonRecord[]) => {
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
            <EnLessonMobileIcon name="edit" />
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
            onClick={() => setEditingNextClassLesson(lesson)}
          >
            <EnLessonMobileIcon name="clock" />
            <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}修改时间</span>
          </button>
        );
        buttons.push(
          <button
            key={`teacher-${lesson.id}`}
            type="button"
            className="jp-lesson-mobile-footer-btn"
            onClick={() => setEditingTeacherLesson(lesson)}
          >
            <EnLessonMobileIcon name="user" />
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

  const renderSharedTeacherCell = (groupLessons: EnLessonRecord[]) => {
    const lesson = groupLessons[0];
    return (
      <td data-label="上课老师" className="jp-lesson-teacher-col">
        <div className="jp-lesson-teacher-cell">
          <span>{formatLessonTeacherNames(lesson, teacherNameById)}</span>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <EnEditIconButton
                key={item.id}
                title={`设置 #${item.id} 上课老师`}
                disabled={savingTeacherId === item.id}
                onClick={() => setEditingTeacherLesson(item)}
              />
            ))}
          </div>
        </div>
      </td>
    );
  };

  const renderSharedClassTimeCell = (groupLessons: EnLessonRecord[]) => {
    const lesson = groupLessons[0];
    const progressStatus = getEnLessonProgressStatus(lesson);
    const classSchedules = getLessonClassSchedules(lesson);

    return (
      <td data-label="上课时间" className="jp-lesson-next-class-col">
        <div className="jp-lesson-next-class-cell">
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
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <EnEditIconButton
                key={item.id}
                title={`设置 #${item.id} 上课时间`}
                disabled={savingNextClassId === item.id}
                onClick={() => setEditingNextClassLesson(item)}
              />
            ))}
          </div>
        </div>
      </td>
    );
  };

  const renderLessonTable = (
    displayGroups: EnLessonDisplayGroup<EnLessonRecord>[],
    dayToneByDate?: Map<string, number>
  ) => (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th className="jp-lesson-id-col">ID</th>
            <th className="jp-lesson-kind-col" title="学习类型：词 / 法">
              类
            </th>
            <th className="jp-lesson-content-col">学习内容</th>
            <th className="jp-lesson-content-count-col" title="按英文/中文逗号分隔统计的词/短语数">
              数
            </th>
            <th className="jp-lesson-uploaded-col">上传日期</th>
            <th className="jp-lesson-status-at-col">最近操作</th>
            <th className="jp-lesson-operator-col">操作人</th>
            {isAdmin ? <th className="jp-lesson-teacher-col">上课老师</th> : null}
            {isAdmin ? (
              <th
                className={`jp-lesson-next-class-col jp-lesson-next-class-col--sortable${
                  classTimeSortOrder === "asc"
                    ? " jp-lesson-next-class-col--sorted-asc"
                    : " jp-lesson-next-class-col--sorted-desc"
                }`}
              >
                <button
                  type="button"
                  className="jp-lesson-sort-btn"
                  title={
                    classTimeSortOrder === "asc"
                      ? "按上课时间从早到晚排序；点击切换为从晚到早。同一老师同一时段的多条教材会合并为一行"
                      : "按上课时间从晚到早排序；点击切换为从早到晚。同一老师同一时段的多条教材会合并为一行"
                  }
                  aria-label={
                    classTimeSortOrder === "asc"
                      ? "上课时间升序，点击切换为降序"
                      : "上课时间降序，点击切换为升序"
                  }
                  onClick={toggleClassTimeSortOrder}
                >
                  上课时间
                  <span className="jp-lesson-sort-indicator" aria-hidden="true">
                    {classTimeSortOrder === "asc" ? "↑" : "↓"}
                  </span>
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
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        data-lesson-anchor={lesson.id}
                      >
                        {lesson.id}
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
                          title={lesson.kind === "grammar" ? "语法" : "单词"}
                        >
                          {lesson.kind === "grammar" ? "法" : "词"}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="学习内容" className="jp-lesson-content-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const mobileContentItems = parseLessonContent(lesson.content);
                      const chipItems = mobileContentItems.length
                        ? mobileContentItems
                        : [lesson.content.trim() || "—"];
                      return (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <EnLessonContentPreview
                          content={lesson.content}
                          expanded={Boolean(expandedContentIds[lesson.id])}
                          onToggle={() => toggleContentExpanded(lesson.id)}
                        />
                        <div
                          className={`jp-lesson-mobile-content-item${
                            merged ? " jp-lesson-merged-stack-item" : ""
                          }`}
                          data-lesson-anchor={lesson.id}
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
                            <ul
                              className="jp-lesson-mobile-content-chips"
                              aria-label={`课程 #${lesson.id} 学习内容`}
                            >
                              {chipItems.map((item, itemIdx) => (
                                <li
                                  key={`${lesson.id}-c-${itemIdx}`}
                                  className="jp-lesson-mobile-content-chip"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                            {canOperate ? (
                              <div className="jp-lesson-mobile-examples-toolbar">
                                <button
                                  type="button"
                                  className="jp-lesson-mobile-content-edit"
                                  title={`修改 #${lesson.id} 教案`}
                                  aria-label={`修改 #${lesson.id} 教案`}
                                  onClick={() => setEditingLesson(lesson)}
                                >
                                  修改
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="词/短语数" className="jp-lesson-content-count-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {parseLessonContent(lesson.content).length}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="upload">
                          {renderLessonDateTime(lesson.uploaded_at)}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="clock">
                          {lesson.status_updated_at
                            ? renderLessonDateTime(lesson.status_updated_at)
                            : "—"}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="user">
                          {lesson.status_updated_by ?? "—"}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                {isAdmin ? renderSharedTeacherCell(group.lessons) : null}
                {isAdmin ? renderSharedClassTimeCell(group.lessons) : null}
                <td data-label="学习状态" className="jp-lesson-complete-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const progressStatus = getEnLessonProgressStatus(lesson);
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
                                  e.target.value as EnLessonProgressStatus
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
                            href={`/en-lesson/notes?id=${lesson.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="jp-lesson-notes-btn"
                            title="在新标签页打开课堂笔记"
                          >
                            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                              <EnLessonMobileIcon name="notes" />
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

  return (
    <main className="page-wrap jp-lesson-page jp-lesson-page--en" style={{ maxWidth: "min(1320px, 92vw)", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>英语新课</h1>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；登录用户可设置学习状态（未完成 / 学习中 / 已完成）。仅「已完成」会同步进入
        <a href="/en-vocab" style={{ color: "var(--accent)" }}>
          英语单词抽问
        </a>
        并带上教案链接。
      </p>

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
                {sectionCount ? (
                  renderLessonTable(
                    sectionGroups,
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

      <EnLessonTeacherEditModal
        open={editingTeacherLesson != null}
        lesson={editingTeacherLesson}
        teachers={teachers}
        saving={savingTeacherId === editingTeacherLesson?.id}
        onClose={() => setEditingTeacherLesson(null)}
        onAddTeacher={addLessonTeacher}
        onDeleteTeacher={deleteLessonTeacher}
        onSave={(teacherIds, teacherOther, teacherUpdates, options) => {
          if (editingTeacherLesson) {
            return setLessonTeachers(
              editingTeacherLesson.id,
              teacherIds,
              teacherOther,
              teacherUpdates,
              options
            );
          }
        }}
      />

      <EnLessonNextClassEditModal
        open={editingNextClassLesson != null}
        lesson={editingNextClassLesson}
        saving={savingNextClassId === editingNextClassLesson?.id}
        onClose={() => setEditingNextClassLesson(null)}
        onSave={(schedules) => {
          if (editingNextClassLesson) {
            void setLessonClassSchedules(editingNextClassLesson.id, schedules);
          }
        }}
      />

      <EnVocabRefEditModal
        open={editingLesson != null}
        lessonId={editingLesson?.id ?? null}
        refKey={editingLesson?.ref_key ?? null}
        refMeta={editingRef}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingLesson(null)}
        onUpdated={handleRefUpdated}
        onNeedAuth={openEnAuth}
      />

      <EnLessonAnnotateModal
        open={annotatingLesson != null}
        imageUrl={annotatingLesson?.viewUrl ?? ""}
        refKey={annotatingLesson?.lesson.ref_key ?? ""}
        lessonId={annotatingLesson?.lesson.id ?? 0}
        lessonContent={annotatingLesson?.lesson.content ?? ""}
        locale={locale}
        canSave={canOperate}
        onClose={() => setAnnotatingLesson(null)}
        onSaved={handleAnnotateSaved}
        onNeedAuth={openEnAuth}
      />

      <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>API 上传说明</summary>
        <p style={{ marginTop: "0.5rem" }}>
          固定链接：<code>{SITE_URL}/en-lesson</code>
        </p>
        <p>
          上传接口：<code>POST /api/en-lesson/upload</code>，Header{" "}
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
{`curl -X POST "${SITE_URL}/api/en-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔。
          相同学习类型与内容已存在时将返回 <code>content_duplicate</code>（HTTP 409）。
          上传带 <code>file</code> 时，系统会自动生成教案标识（如 <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
          上传后默认「未完成」；在列表中改为「已完成」后，会同步写入
          英语单词抽问并带上教案链接。
        </p>
      </details>

      <style jsx>{`
        :global(.page-wrap:has(.jp-lesson-page)) {
          max-width: min(1320px, 92vw);
        }
        :global(.jp-lesson-page) {
          min-width: 0;
          max-width: 100%;
        }
        .jp-lesson-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
          max-width: 100%;
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
          min-width: 0;
          max-width: 100%;
        }
        .jp-lesson-status-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
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
          /* 禁止横向滚动：列宽压缩 + 折行塞进视口（勿用操作列 sticky） */
          overflow-x: hidden;
          max-width: 100%;
          min-width: 0;
        }
        :global(.jp-lesson-table) {
          width: 100%;
          table-layout: fixed;
          overflow: visible;
          border-collapse: collapse;
        }
        @media (min-width: 768px) {
          :global(.jp-lesson-mobile-status-filter) {
            display: none;
          }
          /* Excel 式冻结表头：区内滚动时列名（老师/时间等）始终可见 */
          :global(.jp-lesson-table-wrap) {
            overflow-y: auto;
            max-height: min(70vh, calc(100dvh - 10rem));
            -webkit-overflow-scrolling: touch;
          }
          :global(.jp-lesson-table thead th) {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #243044;
            box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 80%, transparent);
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
          padding: 0.45rem 0.4rem;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        :global(.jp-lesson-id-col) {
          width: 2.5rem;
          min-width: 2.5rem;
          max-width: 2.75rem;
          padding-left: 0.2rem !important;
          padding-right: 0.2rem !important;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          font-size: 0.75rem;
          text-align: center;
        }
        :global(.jp-lesson-kind-col) {
          width: 1.55rem;
          min-width: 1.55rem;
          max-width: 1.7rem;
          padding-left: 0.05rem !important;
          padding-right: 0.05rem !important;
          text-align: center;
        }
        :global(.jp-lesson-content-col) {
          min-width: 0;
          width: 16%;
          word-break: break-word;
        }
        :global(.jp-lesson-content-count-col) {
          width: 2rem;
          min-width: 2rem;
          max-width: 2.25rem;
          padding-left: 0.15rem !important;
          padding-right: 0.15rem !important;
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-content-preview) {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          min-width: 0;
          max-width: 100%;
        }
        :global(.jp-lesson-content-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          line-height: 1.45;
          min-width: 0;
          max-width: 100%;
        }
        :global(.jp-lesson-content-preview.is-clamped .jp-lesson-content-lines) {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        :global(.jp-lesson-content-line) {
          display: block;
          word-break: break-word;
        }
        :global(.jp-lesson-content-more-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.5rem;
          padding: 0.1rem 0.45rem;
          border: 1px solid var(--border);
          border-radius: 5px;
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.75rem;
          line-height: 1.3;
          cursor: pointer;
        }
        :global(.jp-lesson-content-more-btn:hover) {
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
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
        :global(.jp-lesson-uploaded-col),
        :global(.jp-lesson-status-at-col) {
          white-space: normal;
          width: 5.5rem;
          min-width: 5.5rem;
          max-width: 6rem;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
        }
        :global(.jp-lesson-dt-stacked) {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.1rem;
          line-height: 1.25;
        }
        :global(.jp-lesson-dt-date) {
          display: block;
        }
        :global(.jp-lesson-dt-time) {
          display: block;
          color: var(--muted);
          font-size: 0.75rem;
        }
        :global(.jp-lesson-operator-col) {
          white-space: nowrap;
          font-size: 0.8125rem;
          color: var(--muted);
          width: 3.5rem;
          min-width: 3.25rem;
        }
        :global(.jp-lesson-teacher-col) {
          font-size: 0.8125rem;
          min-width: 0;
          width: 7%;
        }
        :global(.jp-lesson-teacher-cell) {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        :global(.jp-lesson-next-class-col) {
          font-size: 0.8125rem;
          min-width: 0;
          width: 8%;
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
        :global(.jp-lesson-next-class-col--sorted-desc .jp-lesson-sort-btn) {
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
          white-space: normal;
          word-break: break-word;
        }
        :global(.jp-lesson-class-duration-label) {
          color: var(--muted);
          font-size: 0.75rem;
          white-space: normal;
        }
        :global(.jp-lesson-next-class-label.is-undefined) {
          color: var(--muted);
        }
        :global(.jp-lesson-next-class-label.is-done) {
          color: var(--fall);
        }
        :global(.jp-lesson-actions-col) {
          text-align: center;
          width: 8.75rem;
          min-width: 8.5rem;
          max-width: 9.25rem;
          white-space: normal;
          vertical-align: middle;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          width: 1.2rem;
          font-size: 0.6875rem;
          padding: 0.08rem 0;
          border-radius: 3px;
          border: 1px solid var(--border);
          color: var(--muted);
          line-height: 1.15;
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
          grid-template-columns: repeat(2, max-content);
          justify-content: center;
          align-items: center;
          gap: 0.3rem;
          margin-inline: auto;
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
        :global(.jp-lesson-action-btn--danger) {
          color: var(--rise);
        }
        :global(.jp-lesson-action-btn--danger:hover) {
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
        }
        :global(.jp-lesson-action-btn--danger:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}
