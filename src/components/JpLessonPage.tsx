"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpLessonAnnotateModal } from "@/components/JpLessonAnnotateModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonTeacherEditModal } from "@/components/JpLessonTeacherEditModal";
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
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  buildJpLessonDisplayGroups,
  buildLearningClassDayToneMap,
  formatClassDurationLabel,
  formatClassDurationLabelCompact,
  formatLessonContentLines,
  formatNextClassAtLabel,
  formatNextClassAtLabelCompact,
  getJpLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  jpLessonProgressToFields,
  normalizeClassDurationMinutes,
  type JpLessonDisplayGroup,
  type JpLessonClassTimeSortOrder,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  jpLessonSchedulePath,
} from "@/lib/locale-path";
import {
  jpVocabRefApiPath,
  jpVocabRefFilename,
  jpVocabRefViewerPath,
} from "@/lib/jp-vocab-ref-shared";
import { SITE_URL } from "@/lib/site";
import type {
  JpLessonClassScheduleInput,
  JpLessonNote,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
} from "@/lib/types";

function readLessonCache(): JpLessonApiPayload | null {
  return readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
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

function groupLessonsForDisplay(
  lessons: JpLessonRecord[],
  classTimeSortOrder: JpLessonClassTimeSortOrder
): JpLessonDisplayGroup<JpLessonRecord>[] {
  return buildJpLessonDisplayGroups(lessons, classTimeSortOrder);
}

function refFilename(refKey: string, ref?: JpVocabRef): string {
  return jpVocabRefFilename(refKey, ref?.media_type === "pdf" ? "pdf" : "image");
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

function formatLessonTeacherNames(
  lesson: JpLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => teacherNameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "—";
}

export function JpLessonPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, openAuthPanel, isAdmin } = useEtrAuth();
  const canOperate = canAccessJpVocab;

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
  const [savingTeacherId, setSavingTeacherId] = useState<number | null>(null);
  const [savingNextClassId, setSavingNextClassId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [mobileStatusFilter, setMobileStatusFilter] =
    useState<JpLessonProgressStatus>("learning");
  const [editingLesson, setEditingLesson] = useState<JpLessonRecord | null>(null);
  const [editingTeacherLesson, setEditingTeacherLesson] = useState<JpLessonRecord | null>(null);
  const [editingNextClassLesson, setEditingNextClassLesson] = useState<JpLessonRecord | null>(null);
  const [annotatingLesson, setAnnotatingLesson] = useState<{
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    viewUrl: string;
  } | null>(null);
  const [classTimeSortOrder, setClassTimeSortOrder] =
    useState<JpLessonClassTimeSortOrder>("asc");

  const toggleClassTimeSortOrder = useCallback(() => {
    setClassTimeSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const applyLessonPayload = useCallback((payload: JpLessonApiPayload) => {
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
        "/api/jp-lesson",
        parseJpLessonApi,
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

  const copyLessonViewLink = async (lessonId: number, viewUrl: string) => {
    try {
      const link = `${SITE_URL}${viewUrl}`;
      const text = isAdmin
        ? `老师，这是咱们需要上课内容，麻烦你有时间的时候抽空看一下：${link}`
        : link;
      await navigator.clipboard.writeText(text);
      setCopiedId(lessonId);
      window.setTimeout(() => setCopiedId(null), 1000);
    } catch {
      setStatus("复制失败，请手动选择复制");
    }
  };

  const setLessonProgress = async (
    lessonId: number,
    progressStatus: JpLessonProgressStatus
  ) => {
    if (!canOperate) {
      openJpAuth();
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
    options?: { keepOpen?: boolean }
  ) => {
    if (!isAdmin || savingTeacherId === lessonId) return;

    const snapshot = lessons.find((l) => l.id === lessonId);
    setSavingTeacherId(lessonId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, teacher_ids: teacherIds, teacher_other: teacherOther } : l
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
      setLessons((prev) => {
        const next = prev.map((l) => (l.id === data.lesson!.id ? data.lesson! : l));
        persistLessonCache(next, refs, notes, teachers);
        return next;
      });
      if (!options?.keepOpen) {
        setEditingTeacherLesson(null);
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

  const addLessonTeacher = async (name: string): Promise<JpLessonTeacher | null> => {
    if (!isAdmin) return null;

    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: JpLessonTeacher;
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
          const existing = teachers.find((t) => t.name === name.trim());
          return existing ?? null;
        }
        return null;
      }
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
      setTeachers((prev) => {
        const next = [...prev, data.teacher!].sort(
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
          return data.lesson!;
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
          随手画
        </button>
      );
    }
    actionItems.push(
      <JpVocabRefDownloadMenu
        key="download"
        downloadUrl={jpVocabRefApiPath(lesson.ref_key!, { download: true })}
        mediaUrl={jpVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })}
        filename={refFilename(lesson.ref_key!, ref)}
        mediaType={ref?.media_type ?? "image"}
        primaryClassName="jp-lesson-action-btn"
        fixedPanel
        allowOriginalDownload={isAdmin}
      />
    );
    actionItems.push(
      <button
        key="copy"
        type="button"
        className="jp-lesson-action-btn"
        onClick={() => void copyLessonViewLink(lesson.id, viewUrl)}
      >
        {copiedId === lesson.id ? "已复制" : "复制"}
      </button>
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

  const renderSharedTeacherCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    return (
      <td data-label="上课老师" className="jp-lesson-teacher-col">
        <div className="jp-lesson-teacher-cell">
          <span>{formatLessonTeacherNames(lesson, teacherNameById)}</span>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <JpEditIconButton
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

  const renderSharedClassTimeCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    const progressStatus = getJpLessonProgressStatus(lesson);
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
              <JpEditIconButton
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
    displayGroups: JpLessonDisplayGroup<JpLessonRecord>[],
    dayToneByDate?: Map<string, number>
  ) => (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>学习类型</th>
            <th>学习内容</th>
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
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
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
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <div className="jp-lesson-content-lines">
                          {formatLessonContentLines(lesson.content).map((line, lineIdx) => (
                            <span key={lineIdx} className="jp-lesson-content-line">
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {renderLessonDateTime(lesson.uploaded_at)}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {lesson.status_updated_at
                          ? renderLessonDateTime(lesson.status_updated_at)
                          : "—"}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {lesson.status_updated_by ?? "—"}
                      </div>
                    ))}
                  </div>
                </td>
                {isAdmin ? renderSharedTeacherCell(group.lessons) : null}
                {isAdmin ? renderSharedClassTimeCell(group.lessons) : null}
                <td data-label="学习状态" className="jp-lesson-complete-col">
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
                <td data-label="课堂笔记" className="jp-lesson-notes-col">
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
                <td data-label="教案操作" className="jp-lesson-actions-col">
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <main
      className="page-wrap jp-lesson-page jp-lesson-page--ja"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语新课</h1>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；登录用户可设置学习状态（未完成 / 学习中 / 已完成）。仅「已完成」会同步进入
        <a href="/jp-vocab" style={{ color: "var(--accent)" }}>
          日语单词抽问
        </a>
        并带上教案链接。
      </p>

      {isAdmin ? (
        <div className="jp-lesson-admin-links">
          <a href={jpLessonSchedulePath()} style={{ color: "var(--accent)" }}>
            日程管理
          </a>
          <a href={adminJpLessonTeachersPath(locale)} style={{ color: "var(--accent)" }}>
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

      <JpLessonTeacherEditModal
        open={editingTeacherLesson != null}
        lesson={editingTeacherLesson}
        teachers={teachers}
        saving={savingTeacherId === editingTeacherLesson?.id}
        onClose={() => setEditingTeacherLesson(null)}
        onAddTeacher={addLessonTeacher}
        onSave={(teacherIds, teacherOther, options) => {
          if (editingTeacherLesson) {
            return setLessonTeachers(
              editingTeacherLesson.id,
              teacherIds,
              teacherOther,
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
          固定链接：<code>{SITE_URL}/jp-lesson</code>
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
{`curl -X POST "${SITE_URL}/api/jp-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔。
          上传带 <code>file</code> 时，系统会自动生成教案标识（如 <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
          上传后默认「未完成」；在列表中改为「已完成」后，会同步写入
          日语单词抽问并带上教案链接。
        </p>
      </details>

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
        :global(.jp-lesson-uploaded-col),
        :global(.jp-lesson-status-at-col) {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
        }
        :global(.jp-lesson-operator-col) {
          white-space: nowrap;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-teacher-col) {
          font-size: 0.8125rem;
          min-width: 6.5rem;
        }
        :global(.jp-lesson-teacher-cell) {
          display: inline-flex;
          align-items: center;
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
      `}</style>
    </main>
  );
}
