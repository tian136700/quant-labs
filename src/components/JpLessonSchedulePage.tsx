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
import { formatManualScheduleLessonOptionLabel } from "@/lib/jp-lesson-manual-schedule-linked";
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
import { EN_SITE_URL } from "@/lib/en-site-host";
import { JP_SITE_URL } from "@/lib/jp-site-host";
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
import { JpLessonScheduleToolbar } from "@/components/jp-lesson-schedule-page/JpLessonScheduleToolbar";
import { JpLessonScheduleModals } from "@/components/jp-lesson-schedule-page/JpLessonScheduleModals";
import { useJpLessonSchedulePageActions } from "@/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions";

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

  const selectedManualLinkedLessons = useMemo(() => {
    if (!selectedManualSchedule?.linked_lessons?.length) return [];
    return selectedManualSchedule.linked_lessons.map((link) => {
      const lesson =
        link.subject === "jp"
          ? lessonById.get(link.lesson_id)
          : enLessonById.get(link.lesson_id);
      const option = {
        subject: link.subject,
        id: link.lesson_id,
        kind: (lesson?.kind === "grammar" ? "grammar" : "word") as "word" | "grammar",
        content: lesson?.content ?? "",
        title: lesson?.title ?? null,
        completed: lesson?.completed ?? false,
        learning: lesson?.learning,
      };
      const refKey = lesson?.ref_key?.trim() || null;
      const href = refKey
        ? link.subject === "en"
          ? enVocabRefViewerPath(refKey, enRefs[refKey]?.updated_at)
          : jpVocabRefViewerPath(refKey, refs[refKey]?.updated_at)
        : null;
      return {
        key: `${link.subject}:${link.lesson_id}`,
        label: formatManualScheduleLessonOptionLabel(option),
        href,
      };
    });
  }, [selectedManualSchedule, lessonById, enLessonById, refs, enRefs]);

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

  const {
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
  } = useJpLessonSchedulePageActions({
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
    setSavingNextClassId,
    setEditingNextClassLesson,
    setEditingEnNextClassLesson,
    loadLessons,
    loadEnLessons,
  });

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
      const siteUrl =
        selectedEvent?.subject === "en" ? EN_SITE_URL : JP_SITE_URL;
      await navigator.clipboard.writeText(`${siteUrl}${selectedViewUrl}`);
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
        selectedManualLinkedLessons={selectedManualLinkedLessons}
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
        jpLessons={lessons}
        enLessons={enLessons}
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
