"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { CopyToast } from "@/components/CopyToast";
import { EnLessonNextClassEditModal } from "@/components/EnLessonNextClassEditModal";
import { JpLessonManualScheduleModal } from "@/components/JpLessonManualScheduleModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonTeacherDisplay } from "@/components/JpLessonTeacherDisplay";
import { type JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import {
  JP_LESSON_CACHE_KEY as EN_LESSON_CACHE_KEY,
  parseEnLessonApi,
  type EnLessonApiPayload,
} from "@/lib/en-api-cache";
import {
  flattenEnLessonScheduleEvents,
  normalizeClassDurationMinutes as normalizeEnClassDurationMinutes,
} from "@/lib/en-lesson-shared";
import {
  JP_LESSON_CACHE_KEY,
  JP_LESSON_REFRESH_TTL_MS,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import {
  hasJpLessonManualScheduleCache,
  JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY,
  JP_LESSON_MANUAL_SCHEDULE_TTL_MS,
  readJpLessonManualScheduleCache,
  syncJpLessonManualScheduleCache,
} from "@/lib/jp-lesson-manual-schedule-cache";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  addBeijingCalendarDays,
  beijingDateOnlyFromClassAt,
  beijingMinutesFromMidnight,
  beijingMonthGridDates,
  beijingTimeHm,
  beijingTodayDateString,
  beijingWeekStartDate,
  beijingRelativeWeekdayLabel,
  flattenJpLessonScheduleEvents,
  formatLessonContentLines,
  formatLessonScheduleDaySummary,
  formatLessonScheduleDurationLabel,
  getJpLessonScheduleEventStatus,
  normalizeClassAtForCompare,
  normalizeClassDurationMinutes,
  parseLessonContent,
  type JpLessonScheduleEventStatus,
} from "@/lib/jp-lesson-shared";
import {
  createJpLessonManualSchedule,
  deleteJpLessonManualSchedule,
  flattenManualSchedulePageEvents,
  loadJpLessonManualSchedulesWithLegacyMigration,
  updateJpLessonManualSchedule,
  type JpLessonManualSchedule,
  type JpLessonSchedulePageEvent,
  type LessonScheduleSubject,
} from "@/lib/jp-lesson-manual-schedule";
import { jpLessonPath, enLessonPath, adminJpLessonTeachersPath } from "@/lib/locale-path";
import { findLessonTeacherByPickerName } from "@/lib/lesson-teacher-search";
import {
  detectScheduleTeacherSubjectFromTitle,
  formatTeacherLessonDisplayLabel,
  resolveLessonTeacherRateFields,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
} from "@/lib/jp-lesson-teachers-cache";
import { jpVocabRefViewerPath } from "@/lib/jp-vocab-ref-shared";
import { SITE_URL } from "@/lib/site";
import { enVocabRefViewerPath } from "@/lib/en-vocab-ref-shared";
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
import { JpLessonSchedulePageStyles } from "@/components/jp-lesson-schedule-page/JpLessonSchedulePageStyles";
import { JpLessonScheduleLayout } from "@/components/jp-lesson-schedule-page/JpLessonScheduleLayout";

import {
  type ViewMode,
  SLOT_MINUTES,
  type DayScheduleEvent,
  formatSlotTime,
  slotIndexFromMinutes,
  findEventForSlot,
  isFirstSlotForEvent,
  getEventSlotSpan,
  shouldRenderTimelineSlot,
  getDayBusySlotRange,
  buildDayTimelineSlotIndices,
  eventTimelinePrimaryLabel,
  eventTimelineEncourageLabel,
  readLessonCache,
  scheduleSubjectLabel,
  scheduleSubjectCssClass,
  formatLessonTeacherNames,
  eventStatusLabel,
  weekStartDate,
  monthGrid,
  exportScheduleText,
  eventContentPreview,
  JpLessonScheduleManualTeacherLinks,
  buildLessonEventDedupKey,
  mergeLessonDisplayContents,
  lessonPayloadNeedsTeacherRefresh,
  readEnLessonCache,
} from "@/components/jp-lesson-schedule-page/jp-lesson-schedule-page-helpers";

export function JpLessonSchedulePage() {
  const { locale } = useI18n();
  const { isAdmin, checking } = useEtrAuth();

  const [lessons, setLessons] = useState<JpLessonRecord[]>(() => readLessonCache()?.lessons ?? []);
  const [enLessons, setEnLessons] = useState<EnLessonRecord[]>(
    () => readEnLessonCache()?.lessons ?? []
  );
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [enRefs, setEnRefs] = useState<Record<string, EnVocabRef>>(
    () => readEnLessonCache()?.refs ?? {}
  );
  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(
    () => readLessonCache()?.teachers ?? []
  );
  const [enTeachers, setEnTeachers] = useState<EnLessonTeacher[]>(
    () => readEnLessonCache()?.teachers ?? []
  );
  const [koTeachers, setKoTeachers] = useState<KoLessonTeacher[]>([]);
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [enLoading, setEnLoading] = useState(() => readEnLessonCache() == null);
  const [enRefreshing, setEnRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setViewMode("day");
    }
  }, []);
  const [selectedDate, setSelectedDate] = useState(() => beijingTodayDateString());
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [manualSchedules, setManualSchedules] = useState<JpLessonManualSchedule[]>(() =>
    readJpLessonManualScheduleCache()
  );
  const [manualSchedulesLoading, setManualSchedulesLoading] = useState(
    () => !hasJpLessonManualScheduleCache()
  );
  const [manualSchedulesRefreshing, setManualSchedulesRefreshing] = useState(false);
  const [savingManualSchedule, setSavingManualSchedule] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualModalMode, setManualModalMode] = useState<"full" | "time">("full");
  const [editingManual, setEditingManual] = useState<JpLessonManualSchedule | null>(null);
  const [editingNextClassLesson, setEditingNextClassLesson] = useState<JpLessonRecord | null>(null);
  const [editingEnNextClassLesson, setEditingEnNextClassLesson] = useState<EnLessonRecord | null>(
    null
  );
  const [savingNextClassId, setSavingNextClassId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const sidebarPanelsRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const savingManualScheduleRef = useRef(false);
  const savingNextClassRef = useRef<number | null>(null);

  useEffect(() => {
    document.title = "日程管理";
  }, []);

  const applyEnLessonPayload = useCallback((payload: EnLessonApiPayload) => {
    setEnLessons(payload.lessons);
    setEnRefs(payload.refs);
    if (payload.teachers) setEnTeachers(payload.teachers);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const applyLessonPayload = useCallback((payload: JpLessonApiPayload) => {
    setLessons(payload.lessons);
    setRefs(payload.refs);
    if (payload.teachers) setTeachers(payload.teachers);
  }, []);

  const loadManualSchedules = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readJpLessonManualScheduleCache();
    const hasCache = hasJpLessonManualScheduleCache();
    const cacheAge = readClientCacheAge(JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_MANUAL_SCHEDULE_TTL_MS;

    if (hasCache) {
      setManualSchedules(cached);
      setManualSchedulesLoading(false);
      if (!cacheFresh) setManualSchedulesRefreshing(true);
    } else {
      setManualSchedulesLoading(true);
    }

    if (cacheFresh) return;

    try {
      const schedules = await loadJpLessonManualSchedulesWithLegacyMigration();
      setManualSchedules(schedules);
      syncJpLessonManualScheduleCache(schedules);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setManualSchedulesLoading(false);
      setManualSchedulesRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!checking && isAdmin) void loadManualSchedules();
  }, [checking, isAdmin, loadManualSchedules]);

  const loadLessons = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readLessonCache();
    const hasCache = cached != null;
    const cacheAge = readClientCacheAge(JP_LESSON_CACHE_KEY);
    const force = Boolean(opts?.force || lessonPayloadNeedsTeacherRefresh(cached));
    const cacheFresh =
      !force &&
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
          force,
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
    // 打开日程立刻拉最新：只展示「学习中」，避免 TTL 内仍用旧状态
    if (!checking && isAdmin) void loadLessons({ force: true });
  }, [checking, isAdmin, loadLessons]);

  const loadEnLessons = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readEnLessonCache();
    const hasCache = cached != null;
    const cacheAge = readClientCacheAge(EN_LESSON_CACHE_KEY);
    const force = Boolean(opts?.force || lessonPayloadNeedsTeacherRefresh(cached));
    const cacheFresh =
      !force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_REFRESH_TTL_MS;

    if (hasCache) {
      applyEnLessonPayload(cached);
      setEnLoading(false);
      if (!cacheFresh) setEnRefreshing(true);
    } else {
      setEnLoading(true);
    }
    setError("");
    try {
      const payload = await fetchWithClientCache(
        EN_LESSON_CACHE_KEY,
        "/api/en-lesson",
        parseEnLessonApi,
        {
          onCached: applyEnLessonPayload,
          ttlMs: JP_LESSON_REFRESH_TTL_MS,
          force,
        }
      );
      applyEnLessonPayload(payload);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setEnLoading(false);
      setEnRefreshing(false);
    }
  }, [applyEnLessonPayload]);

  useEffect(() => {
    if (!checking && isAdmin) void loadEnLessons({ force: true });
  }, [checking, isAdmin, loadEnLessons]);

  const loadKoTeachers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/admin/ko-lesson-teachers", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teachers?: KoLessonTeacher[];
      };
      if (data.ok && Array.isArray(data.teachers)) {
        setKoTeachers(sortJpLessonTeachersByLessonCount(data.teachers));
      }
    } catch {
      // 韩语老师列表仅用于手动日程选人；失败不挡日程主流程
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!checking && isAdmin) void loadKoTeachers();
  }, [checking, isAdmin, loadKoTeachers]);

  const enTeacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of enTeachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [enTeachers]);

  const enTeachersById = useMemo(() => {
    const map = new Map<number, EnLessonTeacher>();
    for (const teacher of enTeachers) {
      map.set(teacher.id, teacher);
    }
    return map;
  }, [enTeachers]);

  const enLessonById = useMemo(() => {
    const map = new Map<number, EnLessonRecord>();
    for (const lesson of enLessons) {
      map.set(lesson.id, lesson);
    }
    return map;
  }, [enLessons]);

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of teachers) {
      map.set(
        teacher.id,
        formatTeacherLessonDisplayLabel(teacher, "zh")
      );
    }
    return map;
  }, [teachers]);

  const teachersById = useMemo(() => {
    const map = new Map<number, JpLessonTeacher>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher);
    }
    return map;
  }, [teachers]);

  const lessonById = useMemo(() => {
    const map = new Map<number, JpLessonRecord>();
    for (const lesson of lessons) {
      map.set(lesson.id, lesson);
    }
    return map;
  }, [lessons]);

  const allEvents = useMemo(() => {
    const jpLessonEvents: DayScheduleEvent[] = flattenJpLessonScheduleEvents(lessons).flatMap(
      (event) => {
        const lesson = lessonById.get(event.lessonId);
        if (!lesson) return [];
        return [
          {
            key: `jp-${event.key}`,
            classAt: event.classAt,
            start: event.start,
            end: event.end,
            durationMinutes: event.durationMinutes,
            teachers: formatLessonTeacherNames(lesson, teacherNameById),
            displayContent: lesson.content,
            source: "lesson" as const,
            subject: "jp" as const,
            lessonId: event.lessonId,
            scheduleId: event.scheduleId,
            lesson: {
              id: lesson.id,
              content: lesson.content,
              ref_key: lesson.ref_key,
            },
          },
        ];
      }
    );
    const enLessonEvents: DayScheduleEvent[] = flattenEnLessonScheduleEvents(enLessons).flatMap(
      (event) => {
        const lesson = enLessonById.get(event.lessonId);
        if (!lesson) return [];
        return [
          {
            key: `en-${event.key}`,
            classAt: event.classAt,
            start: event.start,
            end: event.end,
            durationMinutes: event.durationMinutes,
            teachers: formatLessonTeacherNames(lesson, enTeacherNameById),
            displayContent: lesson.content,
            source: "lesson" as const,
            subject: "en" as const,
            lessonId: event.lessonId,
            scheduleId: event.scheduleId,
            lesson: {
              id: lesson.id,
              content: lesson.content,
              ref_key: lesson.ref_key,
            },
          },
        ];
      }
    );
    const lessonEvents = [...jpLessonEvents, ...enLessonEvents];
    const dedupedLessonEvents: DayScheduleEvent[] = [];
    const lessonEventByKey = new Map<string, DayScheduleEvent>();
    for (const event of lessonEvents) {
      const lesson =
        event.subject === "jp" && event.lessonId != null
          ? (lessonById.get(event.lessonId) ?? null)
          : event.subject === "en" && event.lessonId != null
            ? (enLessonById.get(event.lessonId) ?? null)
            : null;
      const dedupKey = buildLessonEventDedupKey(event, lesson);
      const existing = lessonEventByKey.get(dedupKey);
      if (existing) {
        existing.displayContent = mergeLessonDisplayContents(
          existing.displayContent,
          event.displayContent
        );
        continue;
      }
      lessonEventByKey.set(dedupKey, event);
      dedupedLessonEvents.push(event);
    }
    const manualEvents = flattenManualSchedulePageEvents(manualSchedules);
    return [...dedupedLessonEvents, ...manualEvents].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
  }, [
    lessons,
    enLessons,
    lessonById,
    enLessonById,
    teacherNameById,
    enTeacherNameById,
    manualSchedules,
  ]);

  const weekDates = useMemo(() => {
    const start = weekStartDate(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addBeijingCalendarDays(start, index));
  }, [selectedDate]);

  const eventsForDate = useCallback(
    (dateStr: string) =>
      allEvents.filter((event) => beijingDateOnlyFromClassAt(event.classAt) === dateStr),
    [allEvents]
  );

  const dayEvents = useMemo(() => eventsForDate(selectedDate), [eventsForDate, selectedDate]);
  const dayBusyRange = useMemo(() => getDayBusySlotRange(dayEvents), [dayEvents]);

  useEffect(() => {
    if (viewMode !== "day") {
      if (calendarRef.current) calendarRef.current.style.height = "";
      return;
    }

    const panels = sidebarPanelsRef.current;
    const calendar = calendarRef.current;
    if (!panels || !calendar) return;

    const mq = window.matchMedia("(max-width: 767px)");

    const syncCalendarHeight = () => {
      if (mq.matches) {
        calendar.style.height = "";
        return;
      }
      calendar.style.height = `${panels.offsetHeight}px`;
    };

    syncCalendarHeight();
    const observer = new ResizeObserver(syncCalendarHeight);
    observer.observe(panels);
    mq.addEventListener("change", syncCalendarHeight);
    window.addEventListener("resize", syncCalendarHeight);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncCalendarHeight);
      window.removeEventListener("resize", syncCalendarHeight);
      calendar.style.height = "";
    };
  }, [viewMode, selectedEventKey, dayEvents.length, dayBusyRange, loading]);

  const weekEvents = useMemo(() => {
    const set = new Set(weekDates);
    return allEvents.filter((event) => {
      const date = beijingDateOnlyFromClassAt(event.classAt);
      return date != null && set.has(date);
    });
  }, [allEvents, weekDates]);

  const monthDays = useMemo(() => monthGrid(selectedDate), [selectedDate]);
  const monthEvents = useMemo(() => {
    const set = new Set(monthDays);
    return allEvents.filter((event) => {
      const date = beijingDateOnlyFromClassAt(event.classAt);
      return date != null && set.has(date);
    });
  }, [allEvents, monthDays]);

  const visibleEvents =
    viewMode === "day" ? dayEvents : viewMode === "week" ? weekEvents : monthEvents;

  /** 历史总计：全部已排课（不限当前日/周/月视图）；手动日程按标题归入日语/英语/韩语 */
  const historicalDurationTotals = useMemo(() => {
    let jpMinutes = 0;
    let enMinutes = 0;
    let koMinutes = 0;
    for (const event of allEvents) {
      if (event.subject === "jp") {
        jpMinutes += event.durationMinutes;
        continue;
      }
      if (event.subject === "en") {
        enMinutes += event.durationMinutes;
        continue;
      }
      // 手动日程：与选老师同一套标题推断（韩语 > 英语 > 日语）
      const titleSubject = detectScheduleTeacherSubjectFromTitle(
        event.displayContent ?? ""
      );
      if (titleSubject === "jp") jpMinutes += event.durationMinutes;
      else if (titleSubject === "en") enMinutes += event.durationMinutes;
      else if (titleSubject === "ko") koMinutes += event.durationMinutes;
    }
    return {
      jpMinutes,
      enMinutes,
      koMinutes,
      totalMinutes: jpMinutes + enMinutes + koMinutes,
    };
  }, [allEvents]);

  useEffect(() => {
    const pool =
      viewMode === "day"
        ? dayEvents
        : viewMode === "week"
          ? weekEvents
          : eventsForDate(selectedDate);
    if (!pool.length) {
      setSelectedEventKey(null);
      return;
    }
    if (selectedEventKey && pool.some((event) => event.key === selectedEventKey)) {
      return;
    }
    const todayStr = beijingTodayDateString(now);
    const preferred =
      pool.find(
        (event) =>
          beijingDateOnlyFromClassAt(event.classAt) === todayStr &&
          getJpLessonScheduleEventStatus(event, now) !== "past"
      ) ?? pool[0];
    setSelectedEventKey(preferred.key);
  }, [dayEvents, weekEvents, eventsForDate, selectedDate, selectedEventKey, viewMode, now]);

  const selectedEvent = useMemo(
    () => allEvents.find((event) => event.key === selectedEventKey) ?? null,
    [allEvents, selectedEventKey]
  );

  const selectedViewUrl = useMemo(() => {
    if (!selectedEvent?.lesson?.ref_key) return null;
    if (selectedEvent.subject === "en") {
      const ref = enRefs[selectedEvent.lesson.ref_key];
      return enVocabRefViewerPath(selectedEvent.lesson.ref_key, ref?.updated_at);
    }
    const ref = refs[selectedEvent.lesson.ref_key];
    return jpVocabRefViewerPath(selectedEvent.lesson.ref_key, ref?.updated_at);
  }, [selectedEvent, refs, enRefs]);

  const selectedManualSchedule = useMemo(() => {
    if (!selectedEvent?.manualId) return null;
    return manualSchedules.find((item) => item.id === selectedEvent.manualId) ?? null;
  }, [selectedEvent, manualSchedules]);

  const selectedJpLesson = useMemo(() => {
    if (!selectedEvent?.lessonId || selectedEvent.subject !== "jp") return null;
    return lessonById.get(selectedEvent.lessonId) ?? null;
  }, [selectedEvent, lessonById]);

  const selectedEnLesson = useMemo(() => {
    if (!selectedEvent?.lessonId || selectedEvent.subject !== "en") return null;
    return enLessonById.get(selectedEvent.lessonId) ?? null;
  }, [selectedEvent, enLessonById]);

  const selectedTeacherHref = useCallback(
    (teacherId: number) =>
      adminJpLessonTeachersPath(
        locale,
        teacherId,
        selectedEvent?.subject === "en" ? "en" : "jp"
      ),
    [locale, selectedEvent?.subject]
  );

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
      setSelectedEventKey(`manual-${saved.id}`);
      closeManualModal();
      setStatusMessage(isEditing ? "手动日程已保存" : "手动日程已添加");
      window.setTimeout(() => setStatusMessage(""), 2500);
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

  const todayStr = beijingTodayDateString(now);
  const selectedDateRelativeLabel = useMemo(
    () => beijingRelativeWeekdayLabel(selectedDate, now),
    [selectedDate, now]
  );
  const nowMinutes = beijingMinutesFromMidnight(now);
  const nowSlotIndex = slotIndexFromMinutes(nowMinutes);
  const showNowLine =
    viewMode === "day" &&
    selectedDate === todayStr &&
    dayBusyRange != null &&
    nowSlotIndex >= dayBusyRange.start &&
    nowSlotIndex <= dayBusyRange.end;

  const dayTimelineSlotIndices = useMemo(() => {
    if (viewMode !== "day") return [];
    return buildDayTimelineSlotIndices(dayBusyRange);
  }, [dayBusyRange, viewMode]);

  const dayTimelineRowCount = dayTimelineSlotIndices.length;
  const nowTopPct =
    dayTimelineRowCount > 0 && dayBusyRange
      ? ((nowSlotIndex - dayBusyRange.start +
          (nowMinutes % SLOT_MINUTES) / SLOT_MINUTES) /
          dayTimelineRowCount) *
        100
      : 0;

  const rangeLabel =
    viewMode === "day"
      ? selectedDate
      : viewMode === "week"
        ? `${weekDates[0]} ~ ${weekDates[6]}`
        : selectedDate.slice(0, 7);

  const showCopySuccess = () => {
    setCopyToast(locale === "zh" ? "复制成功" : "Copied");
  };

  const handleExport = async () => {
    const text = exportScheduleText(visibleEvents, rangeLabel);
    try {
      await navigator.clipboard.writeText(text);
      showCopySuccess();
    } catch {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jp-lesson-schedule-${rangeLabel.replace(/\s+/g, "_")}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const copyLessonLink = async () => {
    if (!selectedViewUrl) return;
    try {
      await navigator.clipboard.writeText(`${SITE_URL}${selectedViewUrl}`);
      showCopySuccess();
    } catch {
      /* ignore */
    }
  };

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title="日程管理"
        required="需要管理员权限"
        login="登录"
        registered={!checking && isAdmin}
      />
    );
  }

  return (
    <main className="page-wrap jp-lesson-schedule-page">
      <JpLessonScheduleToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedDateRelativeLabel={selectedDateRelativeLabel}
        dayEvents={dayEvents}
        historicalDurationTotals={historicalDurationTotals}
        openManualModal={() => openManualModal()}
      />


      {error ? (
        <p className="jpls-error" role="alert">
          {error}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="jpls-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      {loading && lessons.length === 0 ? <p className="jpls-muted">加载中…</p> : null}
      {enLoading && enLessons.length === 0 && lessons.length > 0 ? (
        <p className="jpls-muted">加载英语课程…</p>
      ) : null}
      {manualSchedulesLoading && manualSchedules.length === 0 && lessons.length > 0 ? (
        <p className="jpls-muted">加载手动日程…</p>
      ) : null}
      {refreshing || enRefreshing || manualSchedulesRefreshing ? (
        <p className="jpls-muted" role="status">
          同步中…
        </p>
      ) : null}

      <JpLessonScheduleLayout
        calendarRef={calendarRef}
        sidebarPanelsRef={sidebarPanelsRef}
        viewMode={viewMode}
        selectedDate={selectedDate}
        selectedDateRelativeLabel={selectedDateRelativeLabel}
        dayBusyRange={dayBusyRange}
        dayTimelineSlotIndices={dayTimelineSlotIndices}
        dayTimelineRowCount={dayTimelineRowCount}
        dayEvents={dayEvents}
        weekDates={weekDates}
        monthDays={monthDays}
        eventsForDate={eventsForDate}
        now={now}
        nowSlotIndex={nowSlotIndex}
        nowTopPct={nowTopPct}
        showNowLine={showNowLine}
        selectedEventKey={selectedEventKey}
        setSelectedEventKey={setSelectedEventKey}
        setSelectedDate={setSelectedDate}
        setViewMode={setViewMode}
        selectedEvent={selectedEvent}
        selectedViewUrl={selectedViewUrl}
        selectedJpLesson={selectedJpLesson}
        selectedEnLesson={selectedEnLesson}
        selectedTeacherHref={selectedTeacherHref}
        selectedManualSchedule={selectedManualSchedule}
        teachersById={teachersById}
        enTeachersById={enTeachersById}
        teachers={teachers}
        locale={locale}
        todayStr={todayStr}
        copyLessonLink={copyLessonLink}
        openLessonReschedule={openLessonReschedule}
        openManualModal={openManualModal}
        handleDeleteManualSchedule={handleDeleteManualSchedule}
      />

      <JpLessonScheduleModals
        manualModalOpen={manualModalOpen}
        selectedDate={selectedDate}
        editingManual={editingManual}
        manualModalMode={manualModalMode}
        teachers={teachers}
        enTeachers={enTeachers}
        koTeachers={koTeachers}
        savingManualSchedule={savingManualSchedule}
        closeManualModal={closeManualModal}
        handleSaveManualSchedule={handleSaveManualSchedule}
        addLessonTeacher={addLessonTeacher}
        addEnLessonTeacher={addEnLessonTeacher}
        addKoLessonTeacher={addKoLessonTeacher}
        editingNextClassLesson={editingNextClassLesson}
        editingEnNextClassLesson={editingEnNextClassLesson}
        savingNextClassId={savingNextClassId}
        setEditingNextClassLesson={setEditingNextClassLesson}
        setEditingEnNextClassLesson={setEditingEnNextClassLesson}
        setLessonClassSchedules={setLessonClassSchedules}
        setEnLessonClassSchedules={setEnLessonClassSchedules}
      />


      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />

      <JpLessonSchedulePageStyles />
    </main>
  );
}
