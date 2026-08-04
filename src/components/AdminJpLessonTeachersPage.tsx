"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import {
  parseLessonTeacherSubjectFilter,
  type LessonTeacherSubject,
  type LessonTeacherSubjectFilter,
} from "@/lib/locale-path";
import type { JpLessonTeacher, JpLessonTeacherReviewSummary } from "@/lib/types";
import {
  normalizeJpLessonTeacher,
  resolveLessonTeacherRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
  syncJpLessonTeachersCache,
} from "@/lib/jp-lesson-teachers-cache";
import { JP_LESSON_CACHE_KEY, JP_LESSON_REFRESH_TTL_MS } from "@/lib/jp-api-cache";
import { readClientCacheAge } from "@/lib/client-swr-cache";
import {
  JP_LESSON_TEACHER_REVIEW_CACHE_KEY,
  JP_LESSON_TEACHER_REVIEW_TTL_MS,
  readJpLessonTeacherReviewCache,
  syncJpLessonTeacherReviewCache,
} from "@/lib/jp-lesson-teacher-review-cache";
import {
  LESSON_TEACHER_SUBJECTS,
  isLessonTeacherSubject,
  lessonTeacherSubjectSearchParam,
  lessonTeacherSubjectsToLoad,
  teacherReviewApiBase,
  teachersApiBase,
} from "@/lib/lesson-teacher-subject";
import {
  buildTeacherSearchFieldsByRowKey,
  filterTeacherHitsBySearch,
  flattenTeachersBySubject,
  teacherRowKey,
  type TeachersBySubject,
} from "@/components/admin-jp-lesson-teachers-page/admin-jpl-teachers-by-subject";
import {
  calcEquivalentHourlyRate,
  compareNullableNumber,
  compareString,
  nextSortOrder,
  type PendingSearchFocus,
  type SortOrder,
  type TeacherSearchHit,
  type TeacherSortKey,
} from "@/components/admin-jp-lesson-teachers-page/admin-jp-lesson-teachers-page-helpers";
import { AdminJpLessonTeachersPageStyles } from "@/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersPageStyles";
import { AdminJpLessonTeachersHero } from "@/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersHero";
import { AdminJpLessonTeachersList } from "@/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersList";
import { AdminJpLessonTeachersAddModal } from "@/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersAddModal";
import { AdminJpLessonTeachersReviewModals } from "@/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersReviewModals";
import { useAdminJpLessonTeachersActions } from "@/components/admin-jp-lesson-teachers-page/useAdminJpLessonTeachersActions";

export function AdminJpLessonTeachersPageContent() {
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teacherSubjectFilter = useMemo(
    () => parseLessonTeacherSubjectFilter(searchParams.get("subject")),
    [searchParams]
  );
  /** 单科模式的具体科目；「全部」时为 null（行操作带自己的 subject） */
  const concreteSubject: LessonTeacherSubject | null = isLessonTeacherSubject(
    teacherSubjectFilter
  )
    ? teacherSubjectFilter
    : null;
  const focusTeacherId = useMemo(() => {
    const raw = searchParams.get("teacher");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [highlightTeacherKey, setHighlightTeacherKey] = useState<string | null>(null);
  const nav = t("nav");
  const addNameInputRef = useRef<HTMLInputElement | null>(null);

  const [teachersBySubject, setTeachersBySubject] = useState<TeachersBySubject>(() => {
    const cached = readJpLessonTeachersCache();
    return cached.length ? { jp: cached } : {};
  });
  const [loading, setLoading] = useState(() => readJpLessonTeachersCache().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [selectedSearchHit, setSelectedSearchHit] = useState<TeacherSearchHit | null>(null);
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const pendingSearchFocusRef = useRef<PendingSearchFocus | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSubject, setAddSubject] = useState<LessonTeacherSubject>("jp");
  const [newName, setNewName] = useState("");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [newLessonMinutes, setNewLessonMinutes] = useState("");
  const [newTencentMeetingId, setNewTencentMeetingId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSubject, setEditingSubject] = useState<LessonTeacherSubject | null>(null);
  const [editName, setEditName] = useState("");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editLessonMinutes, setEditLessonMinutes] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editTencentMeetingId, setEditTencentMeetingId] = useState("");
  const [reviewSummariesByKey, setReviewSummariesByKey] = useState<
    Map<string, JpLessonTeacherReviewSummary>
  >(new Map());
  const [reviewTeacher, setReviewTeacher] = useState<JpLessonTeacher | null>(null);
  const [reviewTeacherSubject, setReviewTeacherSubject] =
    useState<LessonTeacherSubject>("jp");
  const [creatingUserTeacherId, setCreatingUserTeacherId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<TeacherSortKey>("lessonCount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const switchTeacherSubject = useCallback(
    (next: LessonTeacherSubjectFilter, opts?: { teacherId?: number | null }) => {
      if (next === teacherSubjectFilter) return;
      const params = new URLSearchParams(searchParams.toString());
      const subjectParam = lessonTeacherSubjectSearchParam(next);
      if (subjectParam) params.set("subject", subjectParam);
      else params.delete("subject");
      const nextTeacherId = opts?.teacherId;
      if (
        nextTeacherId != null &&
        Number.isInteger(nextTeacherId) &&
        nextTeacherId > 0
      ) {
        params.set("teacher", String(nextTeacherId));
      } else {
        params.delete("teacher");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams, teacherSubjectFilter]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.title = locale === "zh" ? "人员管理" : "Personnel";
  }, [locale]);

  useEffect(() => {
    if (!addModalOpen) return;
    const timer = window.setTimeout(() => {
      addNameInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [addModalOpen]);

  const loadReviewSummaries = useCallback(async (opts?: { force?: boolean }) => {
    const subjects = LESSON_TEACHER_SUBJECTS;
    const nextMap = new Map<string, JpLessonTeacherReviewSummary>();

    if (subjects.includes("jp")) {
      const cached = readJpLessonTeacherReviewCache();
      const cacheAge = readClientCacheAge(JP_LESSON_TEACHER_REVIEW_CACHE_KEY);
      const cacheFresh =
        !opts?.force &&
        cached.size > 0 &&
        cacheAge != null &&
        cacheAge < JP_LESSON_TEACHER_REVIEW_TTL_MS;
      if (cached.size > 0) {
        for (const [id, summary] of cached) {
          nextMap.set(teacherRowKey("jp", id), summary);
        }
      }
      if (!cacheFresh) {
        try {
          const res = await fetch(`${teacherReviewApiBase("jp")}?summary=1`, {
            credentials: "include",
          });
          const data = (await res.json()) as {
            ok?: boolean;
            summaries?: JpLessonTeacherReviewSummary[];
          };
          if (data.ok) {
            for (const item of data.summaries ?? []) {
              nextMap.set(teacherRowKey("jp", item.teacher_id), item);
            }
            syncJpLessonTeacherReviewCache(data.summaries ?? []);
          }
        } catch {
          /* optional */
        }
      }
    }

    for (const subject of subjects) {
      if (subject === "jp") continue;
      try {
        const res = await fetch(`${teacherReviewApiBase(subject)}?summary=1`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          summaries?: JpLessonTeacherReviewSummary[];
        };
        if (!data.ok) continue;
        for (const item of data.summaries ?? []) {
          nextMap.set(teacherRowKey(subject, item.teacher_id), item);
        }
      } catch {
        /* optional */
      }
    }

    setReviewSummariesByKey(nextMap);
  }, []);

  const loadTeachers = useCallback(async (opts?: { force?: boolean }) => {
    const subjects = LESSON_TEACHER_SUBJECTS;
    const jpCached = readJpLessonTeachersCache();
    const canUseJpCache =
      subjects.includes("jp") &&
      !opts?.force &&
      jpCached.length > 0 &&
      (() => {
        const age = readClientCacheAge(JP_LESSON_CACHE_KEY);
        return age != null && age < JP_LESSON_REFRESH_TTL_MS;
      })();

    if (jpCached.length > 0 && subjects.includes("jp")) {
      setTeachersBySubject((prev) => ({
        ...prev,
        jp: mergeJpLessonTeachersCache(prev.jp ?? [], jpCached),
      }));
    }

    const needNetwork = subjects.some((subject) => {
      if (subject === "jp" && canUseJpCache) return false;
      return true;
    });

    if (needNetwork) {
      const hasAny = subjects.some((s) => (teachersBySubject[s]?.length ?? 0) > 0);
      if (!hasAny && jpCached.length === 0) setLoading(true);
      else setRefreshing(true);
    }

    try {
      await loadReviewSummaries(opts);
      const results = await Promise.all(
        subjects.map(async (subject) => {
          if (subject === "jp" && canUseJpCache) {
            return [subject, jpCached] as const;
          }
          const res = await fetch(teachersApiBase(subject), {
            credentials: "include",
          });
          const data = (await res.json()) as {
            ok?: boolean;
            teachers?: JpLessonTeacher[];
            error?: string;
          };
          if (!data.ok) {
            return [subject, teachersBySubject[subject] ?? []] as const;
          }
          const list = (data.teachers ?? []).map((teacher) =>
            normalizeJpLessonTeacher(teacher)
          );
          if (subject === "jp") {
            syncJpLessonTeachersCache(list);
          }
          return [subject, list] as const;
        })
      );
      setTeachersBySubject((prev) => {
        const next = { ...prev };
        for (const [subject, list] of results) {
          next[subject] = list;
        }
        return next;
      });
    } catch {
      setStatus("加载失败");
      setStatusErr(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadReviewSummaries]);

  useEffect(() => {
    setEditingId(null);
    setEditingSubject(null);
    setEditName("");
    setEditHourlyRate("");
    setEditLessonMinutes("");
    setEditSortOrder(0);
    setEditTencentMeetingId("");
    setReviewTeacher(null);
    setSearchSuggestOpen(false);
    setAddSubject(concreteSubject ?? "jp");
    const pending = pendingSearchFocusRef.current;
    if (pending) {
      pendingSearchFocusRef.current = null;
      setSearchDraft(pending.draft);
      setAppliedSearchQuery(pending.applied);
      if (pending.teacherId != null && pending.subject) {
        setSelectedSearchHit({
          teacher: { id: pending.teacherId } as JpLessonTeacher,
          subject: pending.subject,
        });
      } else {
        setSelectedSearchHit(null);
      }
    } else {
      setSearchDraft("");
      setAppliedSearchQuery("");
      setSelectedSearchHit(null);
    }
  }, [teacherSubjectFilter, concreteSubject]);

  useEffect(() => {
    if (!checking && isAdmin) {
      void loadTeachers({ force: true });
    }
  }, [checking, isAdmin, loadTeachers]);

  useEffect(() => {
    if (teacherSubjectFilter !== "jp" && teacherSubjectFilter !== "all") return;
    const refreshFromSharedCache = () => {
      const cached = readJpLessonTeachersCache();
      if (!cached.length) return;
      setTeachersBySubject((prev) => ({
        ...prev,
        jp: mergeJpLessonTeachersCache(prev.jp ?? [], cached),
      }));
    };
    refreshFromSharedCache();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshFromSharedCache();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [teacherSubjectFilter]);

  const displaySubjects = useMemo(
    () => lessonTeacherSubjectsToLoad(teacherSubjectFilter),
    [teacherSubjectFilter]
  );

  const allHits = useMemo(
    () => flattenTeachersBySubject(teachersBySubject, displaySubjects),
    [teachersBySubject, displaySubjects]
  );

  const crossHits = useMemo(() => {
    if (teacherSubjectFilter === "all") return [] as TeacherSearchHit[];
    const others = LESSON_TEACHER_SUBJECTS.filter((s) => s !== teacherSubjectFilter);
    return flattenTeachersBySubject(teachersBySubject, others);
  }, [teachersBySubject, teacherSubjectFilter]);

  const searchFieldsByRowKey = useMemo(() => {
    const remarkMap = new Map<string, string>();
    for (const [key, summary] of reviewSummariesByKey) {
      remarkMap.set(key, summary.latest_remark ?? "");
    }
    return buildTeacherSearchFieldsByRowKey(
      [...allHits, ...crossHits],
      remarkMap
    );
  }, [allHits, crossHits, reviewSummariesByKey]);

  const sortedHits = useMemo(() => {
    const getScore = (hit: TeacherSearchHit): number | null => {
      const summary = reviewSummariesByKey.get(
        teacherRowKey(hit.subject, hit.teacher.id)
      );
      if (!summary || summary.review_count <= 0 || summary.avg_score == null) {
        return null;
      }
      return summary.avg_score;
    };

    return [...allHits].sort((a, b) => {
      const resolvedA = resolveLessonTeacherRateFields(a.teacher);
      const resolvedB = resolveLessonTeacherRateFields(b.teacher);
      const remarkA =
        reviewSummariesByKey
          .get(teacherRowKey(a.subject, a.teacher.id))
          ?.latest_remark?.trim() ?? "";
      const remarkB =
        reviewSummariesByKey
          .get(teacherRowKey(b.subject, b.teacher.id))
          ?.latest_remark?.trim() ?? "";
      const dateA = new Date(a.teacher.updated_at).getTime();
      const dateB = new Date(b.teacher.updated_at).getTime();
      const comparableDateA = Number.isFinite(dateA) ? dateA : null;
      const comparableDateB = Number.isFinite(dateB) ? dateB : null;

      let result = 0;
      switch (sortKey) {
        case "id":
          result = compareNullableNumber(a.teacher.id, b.teacher.id, sortOrder);
          break;
        case "name":
          result = compareString(resolvedA.name, resolvedB.name, sortOrder);
          break;
        case "lessonCount":
          result = compareNullableNumber(
            a.teacher.lesson_count ?? 0,
            b.teacher.lesson_count ?? 0,
            sortOrder
          );
          break;
        case "rate":
          result = compareNullableNumber(
            resolvedA.hourly_rate,
            resolvedB.hourly_rate,
            sortOrder
          );
          break;
        case "minutes":
          result = compareNullableNumber(
            resolvedA.lesson_minutes,
            resolvedB.lesson_minutes,
            sortOrder
          );
          break;
        case "hourlyEquiv":
          result = compareNullableNumber(
            calcEquivalentHourlyRate(a.teacher),
            calcEquivalentHourlyRate(b.teacher),
            sortOrder
          );
          break;
        case "score":
          result = compareNullableNumber(getScore(a), getScore(b), sortOrder);
          break;
        case "remark":
          result = compareString(remarkA, remarkB, sortOrder);
          break;
        case "updated":
          result = compareNullableNumber(comparableDateA, comparableDateB, sortOrder);
          break;
      }
      if (result !== 0) return result;
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      return a.teacher.sort_order - b.teacher.sort_order || a.teacher.id - b.teacher.id;
    });
  }, [allHits, reviewSummariesByKey, sortKey, sortOrder]);

  const searchSuggestions = useMemo((): TeacherSearchHit[] => {
    const q = searchDraft.trim();
    if (!q) return [];
    const currentHits = filterTeacherHitsBySearch(
      sortedHits,
      q,
      searchFieldsByRowKey
    );
    const otherHits = filterTeacherHitsBySearch(
      crossHits,
      q,
      searchFieldsByRowKey
    );
    return [...currentHits, ...otherHits].slice(0, 12);
  }, [crossHits, searchDraft, searchFieldsByRowKey, sortedHits]);

  const filteredHits = useMemo(() => {
    if (selectedSearchHit != null) {
      return sortedHits.filter(
        (hit) =>
          hit.subject === selectedSearchHit.subject &&
          hit.teacher.id === selectedSearchHit.teacher.id
      );
    }
    return filterTeacherHitsBySearch(sortedHits, searchDraft, searchFieldsByRowKey);
  }, [searchDraft, searchFieldsByRowKey, selectedSearchHit, sortedHits]);

  const applySearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setSearchDraft(query);
      setSelectedSearchHit(null);
      setSearchSuggestOpen(false);

      if (!trimmed) {
        setAppliedSearchQuery("");
        return;
      }

      const currentHits = filterTeacherHitsBySearch(
        flattenTeachersBySubject(teachersBySubject, displaySubjects),
        trimmed,
        searchFieldsByRowKey
      );
      if (currentHits.length > 0) {
        setAppliedSearchQuery(trimmed);
        return;
      }

      if (teacherSubjectFilter !== "all") {
        const otherHits = filterTeacherHitsBySearch(
          crossHits,
          trimmed,
          searchFieldsByRowKey
        );
        if (otherHits.length > 0) {
          pendingSearchFocusRef.current = {
            draft: query,
            applied: trimmed,
            teacherId: null,
            subject: otherHits[0].subject,
          };
          switchTeacherSubject(otherHits[0].subject);
          return;
        }
      }

      setAppliedSearchQuery(trimmed);
    },
    [
      crossHits,
      displaySubjects,
      searchFieldsByRowKey,
      switchTeacherSubject,
      teacherSubjectFilter,
      teachersBySubject,
    ]
  );

  const selectSearchTeacher = useCallback(
    (hit: TeacherSearchHit) => {
      const name = resolveLessonTeacherRateFields(hit.teacher).name;
      if (
        teacherSubjectFilter !== "all" &&
        hit.subject !== teacherSubjectFilter
      ) {
        pendingSearchFocusRef.current = {
          draft: name,
          applied: name,
          teacherId: hit.teacher.id,
          subject: hit.subject,
        };
        switchTeacherSubject(hit.subject, { teacherId: hit.teacher.id });
        return;
      }
      setSearchDraft(name);
      setAppliedSearchQuery(name);
      setSelectedSearchHit(hit);
      setSearchSuggestOpen(false);
    },
    [switchTeacherSubject, teacherSubjectFilter]
  );

  useEffect(() => {
    if (!searchSuggestOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!searchFieldRef.current?.contains(event.target as Node)) {
        setSearchSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [searchSuggestOpen]);

  useEffect(() => {
    if (focusTeacherId == null || loading || concreteSubject == null) return;
    const focusKey = teacherRowKey(concreteSubject, focusTeacherId);
    const inList = allHits.some(
      (hit) => hit.subject === concreteSubject && hit.teacher.id === focusTeacherId
    );
    if (!inList) return;
    const inFiltered = filteredHits.some(
      (hit) => hit.subject === concreteSubject && hit.teacher.id === focusTeacherId
    );
    if (inFiltered) return;
    if (!searchParams.get("teacher")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("teacher");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    void focusKey;
  }, [
    focusTeacherId,
    filteredHits,
    loading,
    allHits,
    concreteSubject,
    searchParams,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (focusTeacherId == null || loading || concreteSubject == null) return;
    if (allHits.length === 0) return;
    const key = teacherRowKey(concreteSubject, focusTeacherId);
    const row = rowRefs.current.get(key);
    if (!row) return;
    setHighlightTeacherKey(key);
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightTeacherKey(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusTeacherId, filteredHits, loading, allHits, concreteSubject]);

  // Resolve pending selected hit to real teacher object after load
  useEffect(() => {
    if (!selectedSearchHit) return;
    if (selectedSearchHit.teacher.name) return;
    const list = teachersBySubject[selectedSearchHit.subject] ?? [];
    const found = list.find((t) => t.id === selectedSearchHit.teacher.id);
    if (found) {
      setSelectedSearchHit({ teacher: found, subject: selectedSearchHit.subject });
    }
  }, [selectedSearchHit, teachersBySubject]);

  const toggleSort = useCallback((key: TeacherSortKey) => {
    setSortOrder((prevOrder) => nextSortOrder(sortKey, key, prevOrder));
    setSortKey(key);
  }, [sortKey]);

  const fieldLabels =
    locale === "zh"
      ? {
          id: "ID",
          name: "名称",
          subject: "类型",
          lessonCount: "上课频次",
          rate: "课时费",
          minutes: "课时时长",
          tencentMeeting: "腾讯会议号",
          hourlyEquiv: "折合时薪",
          score: "平均评分",
          remark: "备注",
          updated: "更新",
          actions: "操作",
        }
      : {
          id: "ID",
          name: "Name",
          subject: "Type",
          lessonCount: "Lessons",
          rate: "Rate (RMB)",
          minutes: "Duration",
          tencentMeeting: "Meeting ID",
          hourlyEquiv: "Hourly equiv.",
          score: "Avg score",
          remark: "Latest note",
          updated: "Updated",
          actions: "Actions",
        };

  const {
    createTeacher,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteTeacher,
    createTeacherUser,
    closeAddModal,
  } = useAdminJpLessonTeachersActions({
    locale,
    addSubject,
    editingSubject,
    teachersBySubject,
    saving,
    editingId,
    editName,
    editHourlyRate,
    editLessonMinutes,
    editSortOrder,
    editTencentMeetingId,
    newName,
    newHourlyRate,
    newLessonMinutes,
    newTencentMeetingId,
    setSaving,
    setStatus,
    setStatusErr,
    setTeachersBySubject,
    setNewName,
    setNewHourlyRate,
    setNewLessonMinutes,
    setNewTencentMeetingId,
    setAddModalOpen,
    setEditingId,
    setEditingSubject,
    setEditName,
    setEditHourlyRate,
    setEditLessonMinutes,
    setEditSortOrder,
    setEditTencentMeetingId,
    setCreatingUserTeacherId,
  });

  const openAddModal = () => {
    setAddSubject(concreteSubject ?? "jp");
    setAddModalOpen(true);
  };

  const openReview = (hit: TeacherSearchHit) => {
    setReviewTeacherSubject(hit.subject);
    setReviewTeacher(hit.teacher);
  };

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title={nav.adminJpLessonTeachers}
        required={locale === "zh" ? "需要管理员权限" : "Admin access required"}
        login={locale === "zh" ? "登录" : "Log in"}
        registered={!checking && isAdmin}
      />
    );
  }

  return (
    <div className="admin-page">
      <AdminJpLessonTeachersHero
        locale={locale}
        teacherSubjectFilter={teacherSubjectFilter}
        navTitle={nav.adminJpLessonTeachers}
      />

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <AdminJpLessonTeachersList
        locale={locale}
        teacherSubjectFilter={teacherSubjectFilter}
        loading={loading}
        refreshing={refreshing}
        saving={saving}
        teachersCount={allHits.length}
        filteredHits={filteredHits}
        searchDraft={searchDraft}
        appliedSearchQuery={appliedSearchQuery}
        searchSuggestOpen={searchSuggestOpen}
        searchSuggestions={searchSuggestions}
        searchFieldRef={searchFieldRef}
        rowRefs={rowRefs}
        highlightTeacherKey={highlightTeacherKey}
        editingId={editingId}
        editingSubject={editingSubject}
        editName={editName}
        editHourlyRate={editHourlyRate}
        editLessonMinutes={editLessonMinutes}
        editTencentMeetingId={editTencentMeetingId}
        reviewSummariesByKey={reviewSummariesByKey}
        creatingUserTeacherId={creatingUserTeacherId}
        sortKey={sortKey}
        sortOrder={sortOrder}
        fieldLabels={fieldLabels}
        selectedSearchHit={selectedSearchHit}
        onOpenAddModal={openAddModal}
        switchTeacherSubject={switchTeacherSubject}
        setSearchDraft={setSearchDraft}
        setSelectedSearchHit={setSelectedSearchHit}
        setSearchSuggestOpen={setSearchSuggestOpen}
        applySearch={applySearch}
        selectSearchTeacher={selectSearchTeacher}
        toggleSort={toggleSort}
        setEditName={setEditName}
        setEditHourlyRate={setEditHourlyRate}
        setEditLessonMinutes={setEditLessonMinutes}
        setEditTencentMeetingId={setEditTencentMeetingId}
        startEdit={startEdit}
        cancelEdit={cancelEdit}
        saveEdit={saveEdit}
        deleteTeacher={deleteTeacher}
        createTeacherUser={createTeacherUser}
        setReviewTeacher={openReview}
      />

      <AdminJpLessonTeachersAddModal
        open={addModalOpen}
        mounted={mounted}
        locale={locale}
        saving={saving}
        newName={newName}
        newHourlyRate={newHourlyRate}
        newLessonMinutes={newLessonMinutes}
        newTencentMeetingId={newTencentMeetingId}
        addNameInputRef={addNameInputRef}
        onClose={closeAddModal}
        onNameChange={setNewName}
        onHourlyRateChange={setNewHourlyRate}
        onLessonMinutesChange={setNewLessonMinutes}
        onTencentMeetingIdChange={setNewTencentMeetingId}
        showTencentMeeting={addSubject === "en"}
        showSubjectSelect={teacherSubjectFilter === "all"}
        addSubject={addSubject}
        onAddSubjectChange={setAddSubject}
        onSubmit={() => void createTeacher()}
      />

      <AdminJpLessonTeachersReviewModals
        teacherSubject={reviewTeacherSubject}
        reviewTeacher={reviewTeacher}
        locale={locale}
        onClose={() => setReviewTeacher(null)}
        onChanged={() => void loadReviewSummaries({ force: true })}
      />

      <AdminJpLessonTeachersPageStyles />
    </div>
  );
}

export function AdminJpLessonTeachersPage() {
  return (
    <Suspense fallback={<div className="admin-page"><p className="hint">Loading…</p></div>}>
      <AdminJpLessonTeachersPageContent />
    </Suspense>
  );
}
