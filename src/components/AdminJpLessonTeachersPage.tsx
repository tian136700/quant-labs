"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
  adminUsersPath,
  enLessonPath,
  jpLessonPath,
  parseLessonTeacherSubject,
  type LessonTeacherSubject,
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
  filterLessonTeachersBySearch,
  lessonTeacherSubjectSearchLabels,
} from "@/lib/lesson-teacher-search";
import {
  lessonTeacherSubjectLabel,
  lessonTeacherSubjectSearchParam,
  lessonTeacherSubjectSkipsUserAccount,
  otherLessonTeacherSubjects,
  teacherReviewApiBase,
  teachersApiBase,
} from "@/lib/lesson-teacher-subject";
import { JP_LESSON_CLASS_DURATION_MINUTES } from "@/lib/jp-lesson-shared";
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
  const teacherSubject = useMemo(
    () => parseLessonTeacherSubject(searchParams.get("subject")),
    [searchParams]
  );
  const focusTeacherId = useMemo(() => {
    const raw = searchParams.get("teacher");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [highlightTeacherId, setHighlightTeacherId] = useState<number | null>(null);
  const nav = t("nav");
  const addNameInputRef = useRef<HTMLInputElement | null>(null);

  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(() => readJpLessonTeachersCache());
  /** 其它科目老师（仅供跨类型模糊搜索；列表仍按当前 subject 展示） */
  const [crossSubjectTeachers, setCrossSubjectTeachers] = useState<
    Partial<Record<LessonTeacherSubject, JpLessonTeacher[]>>
  >({});
  const [loading, setLoading] = useState(() => readJpLessonTeachersCache().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  /** 搜索框输入草稿；点「搜索」或从候选选中后才写入 appliedSearchQuery */
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  /** 从候选点选时精确定位该老师；文本搜索时为 null */
  const [selectedSearchTeacherId, setSelectedSearchTeacherId] = useState<number | null>(
    null
  );
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  /** 因搜索命中另一科目而切 subject 时，保留搜索态（避免 effect 清空） */
  const pendingSearchFocusRef = useRef<PendingSearchFocus | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [newLessonMinutes, setNewLessonMinutes] = useState("");
  const [newTencentMeetingId, setNewTencentMeetingId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editLessonMinutes, setEditLessonMinutes] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editTencentMeetingId, setEditTencentMeetingId] = useState("");
  const [reviewSummaries, setReviewSummaries] = useState<
    Map<number, JpLessonTeacherReviewSummary>
  >(() => readJpLessonTeacherReviewCache());
  const [reviewTeacher, setReviewTeacher] = useState<JpLessonTeacher | null>(null);
  const [creatingUserTeacherId, setCreatingUserTeacherId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<TeacherSortKey>("lessonCount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const switchTeacherSubject = useCallback(
    (next: LessonTeacherSubject, opts?: { teacherId?: number | null }) => {
      if (next === teacherSubject) return;
      const params = new URLSearchParams(searchParams.toString());
      const subjectParam = lessonTeacherSubjectSearchParam(next);
      if (subjectParam) params.set("subject", subjectParam);
      else params.delete("subject");
      // jp/en/ko 老师表 id 各自独立，跨科目保留旧 teacher= 会指到别人，并导致搜索被清掉
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
    [pathname, router, searchParams, teacherSubject]
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
    if (teacherSubject === "jp") {
      const cached = readJpLessonTeacherReviewCache();
      const cacheAge = readClientCacheAge(JP_LESSON_TEACHER_REVIEW_CACHE_KEY);
      const cacheFresh =
        !opts?.force &&
        cached.size > 0 &&
        cacheAge != null &&
        cacheAge < JP_LESSON_TEACHER_REVIEW_TTL_MS;

      if (cached.size > 0) {
        setReviewSummaries(cached);
      }
      if (cacheFresh) return;
    } else {
      setReviewSummaries(new Map());
    }

    try {
      const res = await fetch(`${teacherReviewApiBase(teacherSubject)}?summary=1`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summaries?: JpLessonTeacherReviewSummary[];
      };
      if (!data.ok) return;
      const map = new Map<number, JpLessonTeacherReviewSummary>();
      for (const item of data.summaries ?? []) {
        map.set(item.teacher_id, item);
      }
      setReviewSummaries(map);
      if (teacherSubject === "jp") {
        syncJpLessonTeacherReviewCache(data.summaries ?? []);
      }
    } catch {
      /* summary is optional; ignore load errors */
    }
  }, [teacherSubject]);

  const loadTeachers = useCallback(async (opts?: { force?: boolean }) => {
    const cached = teacherSubject === "jp" ? readJpLessonTeachersCache() : [];
    const hasCache = cached.length > 0;
    const cacheAge = readClientCacheAge(JP_LESSON_CACHE_KEY);
    const cacheFresh =
      teacherSubject === "jp" &&
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_REFRESH_TTL_MS;

    if (hasCache) {
      setTeachers(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setTeachers([]);
      setLoading(true);
    }

    try {
      const tasks: Promise<void>[] = [loadReviewSummaries(opts)];

      if (!cacheFresh) {
        tasks.push(
          (async () => {
            const res = await fetch(teachersApiBase(teacherSubject), {
              credentials: "include",
            });
            const data = (await res.json()) as {
              ok?: boolean;
              teachers?: JpLessonTeacher[];
              error?: string;
            };
            if (!data.ok) {
              if (!hasCache) {
                setStatus(data.error || "加载失败");
                setStatusErr(true);
              }
              return;
            }
            const list = (data.teachers ?? []).map((teacher) =>
              normalizeJpLessonTeacher(teacher)
            );
            setTeachers(list);
            if (teacherSubject === "jp") {
              syncJpLessonTeachersCache(list);
            }
          })()
        );
      }

      await Promise.all(tasks);
    } catch {
      if (!hasCache) {
        setStatus("加载失败");
        setStatusErr(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadReviewSummaries, teacherSubject]);

  const loadCrossSubjectTeachers = useCallback(async () => {
    const subjects = otherLessonTeacherSubjects(teacherSubject);
    const entries = await Promise.all(
      subjects.map(async (subject) => {
        try {
          const res = await fetch(teachersApiBase(subject), {
            credentials: "include",
          });
          const data = (await res.json()) as {
            ok?: boolean;
            teachers?: JpLessonTeacher[];
          };
          if (!data.ok) return [subject, []] as const;
          return [
            subject,
            (data.teachers ?? []).map((teacher) => normalizeJpLessonTeacher(teacher)),
          ] as const;
        } catch {
          return [subject, []] as const;
        }
      })
    );
    setCrossSubjectTeachers(Object.fromEntries(entries));
  }, [teacherSubject]);

  useEffect(() => {
    setEditingId(null);
    setEditName("");
    setEditHourlyRate("");
    setEditLessonMinutes("");
    setEditSortOrder(0);
    setEditTencentMeetingId("");
    setReviewTeacher(null);
    setCrossSubjectTeachers({});
    setSearchSuggestOpen(false);
    const pending = pendingSearchFocusRef.current;
    if (pending) {
      pendingSearchFocusRef.current = null;
      setSearchDraft(pending.draft);
      setAppliedSearchQuery(pending.applied);
      setSelectedSearchTeacherId(pending.teacherId);
    } else {
      setSearchDraft("");
      setAppliedSearchQuery("");
      setSelectedSearchTeacherId(null);
    }
    if (!checking && isAdmin) {
      void loadTeachers({ force: true });
      void loadCrossSubjectTeachers();
    }
  }, [checking, isAdmin, teacherSubject, loadTeachers, loadCrossSubjectTeachers]);

  /** 与日语新课页共用 localStorage 老师缓存；切回此页时合并新课页刚保存的数据 */
  useEffect(() => {
    if (teacherSubject !== "jp") return;
    const refreshFromSharedCache = () => {
      const cached = readJpLessonTeachersCache();
      if (!cached.length) return;
      setTeachers((prev) => mergeJpLessonTeachersCache(prev, cached));
    };

    refreshFromSharedCache();

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshFromSharedCache();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [teacherSubject]);

  const sortedTeachers = useMemo(() => {
    const getScore = (teacherId: number): number | null => {
      const summary = reviewSummaries.get(teacherId);
      if (!summary || summary.review_count <= 0 || summary.avg_score == null) return null;
      return summary.avg_score;
    };

    return [...teachers].sort((a, b) => {
      const resolvedA = resolveLessonTeacherRateFields(a);
      const resolvedB = resolveLessonTeacherRateFields(b);
      const remarkA = reviewSummaries.get(a.id)?.latest_remark?.trim() ?? "";
      const remarkB = reviewSummaries.get(b.id)?.latest_remark?.trim() ?? "";
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      const comparableDateA = Number.isFinite(dateA) ? dateA : null;
      const comparableDateB = Number.isFinite(dateB) ? dateB : null;

      let result = 0;
      switch (sortKey) {
        case "id":
          result = compareNullableNumber(a.id, b.id, sortOrder);
          break;
        case "name":
          result = compareString(resolvedA.name, resolvedB.name, sortOrder);
          break;
        case "lessonCount":
          result = compareNullableNumber(a.lesson_count ?? 0, b.lesson_count ?? 0, sortOrder);
          break;
        case "rate":
          result = compareNullableNumber(resolvedA.hourly_rate, resolvedB.hourly_rate, sortOrder);
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
            calcEquivalentHourlyRate(a),
            calcEquivalentHourlyRate(b),
            sortOrder
          );
          break;
        case "score":
          result = compareNullableNumber(getScore(a.id), getScore(b.id), sortOrder);
          break;
        case "remark":
          result = compareString(remarkA, remarkB, sortOrder);
          break;
        case "updated":
          result = compareNullableNumber(comparableDateA, comparableDateB, sortOrder);
          break;
      }
      if (result !== 0) return result;
      return a.sort_order - b.sort_order || a.id - b.id;
    });
  }, [reviewSummaries, sortKey, sortOrder, teachers]);

  const searchRemarksById = useMemo(
    () =>
      new Map(
        teachers.map((teacher) => [
          teacher.id,
          {
            remark: reviewSummaries.get(teacher.id)?.latest_remark ?? "",
            subjectLabels: lessonTeacherSubjectSearchLabels(teacherSubject),
          },
        ])
      ),
    [reviewSummaries, teacherSubject, teachers]
  );

  const crossSubjectSearchFieldsById = useMemo(() => {
    const map = new Map<number, { subjectLabels?: string }>();
    for (const [subject, list] of Object.entries(crossSubjectTeachers) as Array<
      [LessonTeacherSubject, JpLessonTeacher[]]
    >) {
      if (!list?.length) continue;
      for (const teacher of list) {
        map.set(teacher.id, {
          subjectLabels: lessonTeacherSubjectSearchLabels(subject),
        });
      }
    }
    return map;
  }, [crossSubjectTeachers]);

  const crossSubjectTeacherHits = useMemo((): TeacherSearchHit[] => {
    const hits: TeacherSearchHit[] = [];
    for (const [subject, list] of Object.entries(crossSubjectTeachers) as Array<
      [LessonTeacherSubject, JpLessonTeacher[]]
    >) {
      if (!list?.length) continue;
      for (const teacher of list) {
        hits.push({ teacher, subject });
      }
    }
    return hits;
  }, [crossSubjectTeachers]);

  const searchSuggestions = useMemo((): TeacherSearchHit[] => {
    const q = searchDraft.trim();
    if (!q) return [];
    const currentHits = filterLessonTeachersBySearch(
      sortedTeachers,
      q,
      searchRemarksById
    ).map((teacher) => ({ teacher, subject: teacherSubject }));
    const otherHits: TeacherSearchHit[] = [];
    for (const hit of crossSubjectTeacherHits) {
      const haystackFields = crossSubjectSearchFieldsById.get(hit.teacher.id);
      if (
        filterLessonTeachersBySearch([hit.teacher], q, haystackFields ? new Map([[hit.teacher.id, haystackFields]]) : undefined).length
      ) {
        otherHits.push(hit);
      }
    }
    return [...currentHits, ...otherHits].slice(0, 12);
  }, [
    crossSubjectSearchFieldsById,
    crossSubjectTeacherHits,
    searchDraft,
    searchRemarksById,
    sortedTeachers,
    teacherSubject,
  ]);

  const filteredTeachers = useMemo(() => {
    if (selectedSearchTeacherId != null) {
      return sortedTeachers.filter((teacher) => teacher.id === selectedSearchTeacherId);
    }
    // 边输入边过滤；勿只等点「搜索」（否则列表一直是全员，像「匹配失败」）
    return filterLessonTeachersBySearch(
      sortedTeachers,
      searchDraft,
      searchRemarksById
    );
  }, [searchDraft, searchRemarksById, selectedSearchTeacherId, sortedTeachers]);

  const applySearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setSearchDraft(query);
      setSelectedSearchTeacherId(null);
      setSearchSuggestOpen(false);

      if (!trimmed) {
        setAppliedSearchQuery("");
        return;
      }

      const currentHits = filterLessonTeachersBySearch(
        teachers,
        trimmed,
        searchRemarksById
      );
      if (currentHits.length > 0) {
        setAppliedSearchQuery(trimmed);
        return;
      }

      const otherHits = crossSubjectTeacherHits.filter((hit) =>
        filterLessonTeachersBySearch(
          [hit.teacher],
          trimmed,
          crossSubjectSearchFieldsById.has(hit.teacher.id)
            ? new Map([[hit.teacher.id, crossSubjectSearchFieldsById.get(hit.teacher.id)!]])
            : undefined
        ).length > 0
      );
      if (otherHits.length > 0) {
        pendingSearchFocusRef.current = {
          draft: query,
          applied: trimmed,
          teacherId: null,
        };
        switchTeacherSubject(otherHits[0].subject);
        return;
      }

      setAppliedSearchQuery(trimmed);
    },
    [
      crossSubjectSearchFieldsById,
      crossSubjectTeacherHits,
      searchRemarksById,
      switchTeacherSubject,
      teachers,
    ]
  );

  const selectSearchTeacher = useCallback(
    (hit: TeacherSearchHit) => {
      const name = resolveLessonTeacherRateFields(hit.teacher).name;
      if (hit.subject !== teacherSubject) {
        pendingSearchFocusRef.current = {
          draft: name,
          applied: name,
          teacherId: hit.teacher.id,
        };
        switchTeacherSubject(hit.subject, { teacherId: hit.teacher.id });
        return;
      }
      setSearchDraft(name);
      setAppliedSearchQuery(name);
      setSelectedSearchTeacherId(hit.teacher.id);
      setSearchSuggestOpen(false);
    },
    [switchTeacherSubject, teacherSubject]
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
    if (focusTeacherId == null || loading) return;
    if (!teachers.some((teacher) => teacher.id === focusTeacherId)) return;
    if (filteredTeachers.some((teacher) => teacher.id === focusTeacherId)) return;
    // 用户正在搜索时不要清空搜索框（旧逻辑会清掉 → 又变回全员列表）
    // 深链 teacher= 与当前过滤冲突时，丢掉 URL 里的 teacher，让搜索结果保留
    if (!searchParams.get("teacher")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("teacher");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [
    focusTeacherId,
    filteredTeachers,
    loading,
    teachers,
    searchParams,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (focusTeacherId == null || loading || teachers.length === 0) return;
    const row = rowRefs.current.get(focusTeacherId);
    if (!row) return;
    setHighlightTeacherId(focusTeacherId);
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightTeacherId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusTeacherId, filteredTeachers, loading, teachers]);

  const toggleSort = useCallback((key: TeacherSortKey) => {
    setSortOrder((prevOrder) => nextSortOrder(sortKey, key, prevOrder));
    setSortKey(key);
  }, [sortKey]);

  const fieldLabels =
    locale === "zh"
      ? {
          id: "ID",
          name: "名称",
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
    teacherSubject,
    teachers,
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
    setTeachers,
    setNewName,
    setNewHourlyRate,
    setNewLessonMinutes,
    setNewTencentMeetingId,
    setAddModalOpen,
    setEditingId,
    setEditName,
    setEditHourlyRate,
    setEditLessonMinutes,
    setEditSortOrder,
    setEditTencentMeetingId,
    setCreatingUserTeacherId,
  });

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
      <AdminJpLessonTeachersHero locale={locale} teacherSubject={teacherSubject} navTitle={nav.adminJpLessonTeachers} />


      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <AdminJpLessonTeachersList
        locale={locale}
        teacherSubject={teacherSubject}
        loading={loading}
        refreshing={refreshing}
        saving={saving}
        teachers={teachers}
        filteredTeachers={filteredTeachers}
        searchDraft={searchDraft}
        appliedSearchQuery={appliedSearchQuery}
        searchSuggestOpen={searchSuggestOpen}
        searchSuggestions={searchSuggestions}
        searchFieldRef={searchFieldRef}
        rowRefs={rowRefs}
        highlightTeacherId={highlightTeacherId}
        editingId={editingId}
        editName={editName}
        editHourlyRate={editHourlyRate}
        editLessonMinutes={editLessonMinutes}
        editTencentMeetingId={editTencentMeetingId}
        reviewSummaries={reviewSummaries}
        creatingUserTeacherId={creatingUserTeacherId}
        sortKey={sortKey}
        sortOrder={sortOrder}
        fieldLabels={fieldLabels}
        selectedSearchTeacherId={selectedSearchTeacherId}
        onOpenAddModal={() => setAddModalOpen(true)}
        switchTeacherSubject={switchTeacherSubject}
        setSearchDraft={setSearchDraft}
        setSelectedSearchTeacherId={setSelectedSearchTeacherId}
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
        setReviewTeacher={setReviewTeacher}
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
        showTencentMeeting={teacherSubject === "en"}
        onSubmit={() => void createTeacher()}
      />

      <AdminJpLessonTeachersReviewModals
        teacherSubject={teacherSubject}
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
