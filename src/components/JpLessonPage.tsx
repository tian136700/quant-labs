"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  readStoredJpLessonListFilter,
  writeStoredJpLessonListFilter,
  type JpLessonListFilter,
} from "@/lib/lesson-mobile-status-filter";
import {
  JP_LESSON_CACHE_KEY,
  JP_LESSON_REFRESH_TTL_MS,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import type { JpLessonExamplesViewTarget } from "@/components/JpLessonExamplesViewModal";
import { isJpLessonCurrentlyInClass } from "@/lib/jp-lesson-in-class";
import {
  buildJpLessonDisplayGroupsById,
  buildLearningClassDayToneMap,
  getJpLessonProgressStatus,
  type JpLessonDisplayGroup,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import {
  countJpLessonsByPendingKind,
  filterJpLessonDisplayGroupsByPendingKind,
  readStoredJpLessonPendingKindFilter,
  writeStoredJpLessonPendingKindFilter,
  type JpLessonPendingKindFilter,
} from "@/lib/jp-lesson-pending-kind-filter";
import {
  fetchWithClientCache,
  readClientCacheAge,
} from "@/lib/client-swr-cache";
import {
  adminJpLessonTeachersPath,
  jpLessonSchedulePath,
} from "@/lib/locale-path";
import { filterJpLessonsBySearch } from "@/lib/jp-lesson-search";
import { normalizeJpLessonTeacher } from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
} from "@/lib/jp-lesson-teachers-cache";
import type {
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
} from "@/lib/types";
import { JpLessonPageStyles } from "@/components/jp-lesson-page/JpLessonPageStyles";
import { useJpLessonPageActions } from "@/components/jp-lesson-page/useJpLessonPageActions";
import { JpLessonPageSections } from "@/components/jp-lesson-page/JpLessonPageSections";
import { JpLessonPageModals } from "@/components/jp-lesson-page/JpLessonPageModals";
import { JpLessonApiUploadDocs } from "@/components/jp-lesson-page/JpLessonApiUploadDocs";
import { useJpLessonCourseMergeCopy } from "@/components/jp-lesson-page/useJpLessonCourseMergeCopy";
import { saveJpLessonContentMeanings } from "@/components/jp-lesson-page/saveJpLessonContentMeanings";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import type { JpLessonVocabSyncProgress } from "@/components/jp-lesson-page/runJpLessonVocabSyncChunks";
import {
  DEFAULT_JP_LESSON_SECTION_SORT,
  buildTeacherById,
  groupLessonsForDisplay,
  readLessonCache,
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
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>(
    () => readLessonCache()?.note_counts ?? {}
  );
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(
    () => readLessonCache()?.teachers ?? []
  );
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [vocabSyncProgress, setVocabSyncProgress] =
    useState<JpLessonVocabSyncProgress | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingTeacherLessonId, setSavingTeacherLessonId] = useState<number | null>(null);
  const [savingNextClassId, setSavingNextClassId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedBatchKey, setCopiedBatchKey] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [mobileStatusFilter, setMobileStatusFilterState] =
    useState<JpLessonListFilter>(() => readStoredJpLessonListFilter());
  /** 未完成区：全部 / 单词 / 语法 */
  const [pendingKindFilter, setPendingKindFilterState] =
    useState<JpLessonPendingKindFilter>(() =>
      readStoredJpLessonPendingKindFilter()
    );
  /** 北京时间墙钟：用于「上课中」窗口；与日程页同频 60s 刷新 */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [editingLesson, setEditingLesson] = useState<JpLessonRecord | null>(null);
  const [editingContentLesson, setEditingContentLesson] =
    useState<JpLessonRecord | null>(null);
  const [savingContentId, setSavingContentId] = useState<number | null>(null);
  const [viewingWordsLesson, setViewingWordsLesson] =
    useState<JpLessonRecord | null>(null);
  const [editingTeacherLesson, setEditingTeacherLesson] = useState<JpLessonRecord | null>(null);
  const [editingTeacherLessonIds, setEditingTeacherLessonIds] = useState<number[]>([]);
  const [editingNextClassLesson, setEditingNextClassLesson] = useState<JpLessonRecord | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchLessonIds, setBatchLessonIds] = useState<number[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [annotatingLesson, setAnnotatingLesson] = useState<{
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    /** 教案文件 API（图片或 PDF）；勿用查看页 HTML URL */
    imageUrl: string;
    mediaType?: "image" | "pdf";
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
    setNoteCounts(payload.note_counts ?? {});
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

  /** 点「上课中」强制拉最新上课时间（日程关联刚写入时 TTL 缓存可能还是旧的） */
  const setMobileStatusFilter = useCallback(
    (status: JpLessonListFilter) => {
      setMobileStatusFilterState(status);
      writeStoredJpLessonListFilter(status);
      if (status === "in_class") {
        void loadLessons({ force: true });
      }
    },
    [loadLessons]
  );

  const setPendingKindFilter = useCallback(
    (kind: JpLessonPendingKindFilter) => {
      setPendingKindFilterState(kind);
      writeStoredJpLessonPendingKindFilter(kind);
      // 切换类型后勾选可能已不在当前列表，清空批量勾选避免误操作
      setBatchLessonIds([]);
    },
    []
  );

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

  const pendingKindCounts = useMemo(
    () => countJpLessonsByPendingKind(lessonsByStatus.pending),
    [lessonsByStatus.pending]
  );

  const displayGroupsByStatus = useMemo(() => {
    const pendingGroups = buildJpLessonDisplayGroupsById(lessonsByStatus.pending);
    const groups: Record<JpLessonProgressStatus, JpLessonDisplayGroup<JpLessonRecord>[]> = {
      learning: groupLessonsForDisplay(lessonsByStatus.learning, sectionSort.learning),
      // 未完成：ID 越小越靠前；非搜索时再按单词/语法筛
      pending: searchActive
        ? pendingGroups
        : filterJpLessonDisplayGroupsByPendingKind(
            pendingGroups,
            pendingKindFilter
          ),
      completed: groupLessonsForDisplay(lessonsByStatus.completed, sectionSort.completed),
    };
    return groups;
  }, [lessonsByStatus, sectionSort, pendingKindFilter, searchActive]);

  /** 「上课中」= 开课前 10 分钟起至本节课结束（不限定老师；含日程关联的课） */
  const inClassLessons = useMemo(
    () => filteredLessons.filter((lesson) => isJpLessonCurrentlyInClass(lesson, now)),
    [filteredLessons, now]
  );

  const inClassDisplayGroups = useMemo(
    () => groupLessonsForDisplay(inClassLessons, sectionSort.learning),
    [inClassLessons, sectionSort.learning]
  );

  const learningDayToneByDate = useMemo(
    () => buildLearningClassDayToneMap(displayGroupsByStatus.learning),
    [displayGroupsByStatus.learning]
  );

  const inClassDayToneByDate = useMemo(
    () => buildLearningClassDayToneMap(inClassDisplayGroups),
    [inClassDisplayGroups]
  );

  const noteCountByLesson = useMemo(() => {
    const map = new Map<number, number>();
    for (const [lessonId, count] of Object.entries(noteCounts)) {
      const id = Number(lessonId);
      const cnt = Number(count) || 0;
      if (id > 0 && cnt > 0) map.set(id, cnt);
    }
    return map;
  }, [noteCounts]);

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
    setCopyToast("复制失败");
  }, []);

  const { mergeBusy, copyCourseMerge } = useJpLessonCourseMergeCopy({
    refs,
    canOperate,
    onCopyToast: setCopyToast,
    onRefSaved: (ref) => {
      setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
    },
  });

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

  const {
    setLessonProgress,
    setLessonTeachersForMany,
    addLessonTeacher,
    updateLessonTeacher,
    deleteLessonTeacher,
    setLessonClassSchedules,
    setBatchClassSchedulesAndTeachers,
    handleRefUpdated,
    handleAnnotateSaved,
    deleteLesson,
  } = useJpLessonPageActions({
    locale,
    user,
    canOperate,
    isAdmin,
    openJpAuth,
    lessons,
    refs,
    noteCounts,
    teachers,
    savingId,
    savingTeacherLessonId,
    savingNextClassId,
    deletingId,
    batchLessonIds,
    setLessons,
    setRefs,
    setNoteCounts,
    setTeachers,
    setStatus,
    setSavingId,
    setSavingTeacherLessonId,
    setSavingNextClassId,
    setDeletingId,
    setEditingTeacherLesson,
    setEditingTeacherLessonIds,
    setEditingNextClassLesson,
    setBatchLessonIds,
    setBatchModalOpen,
    setBatchSaving,
    setAnnotatingLesson,
    setVocabSyncProgress,
    loadLessons,
  });

  const saveLessonContentMeanings = useCallback(
    (lessonId: number, content: string, meanings: string | null) =>
      saveJpLessonContentMeanings({
        locale,
        canOperate,
        lessonId,
        content,
        meanings,
        lessons,
        refs,
        noteCounts,
        teachers,
        setLessons,
        setStatus,
        setSavingContentId,
        setEditingContentLesson,
      }),
    [
      locale,
      canOperate,
      lessons,
      refs,
      noteCounts,
      teachers,
    ]
  );

  const editingRef = editingLesson?.ref_key ? refs[editingLesson.ref_key] : undefined;


  return (
    <main
      className="page-wrap jp-lesson-page jp-lesson-page--ja"
      style={{ maxWidth: "min(1320px, 100%)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语新课</h1>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；具备「新课编辑」权限的登录用户可设置学习状态（未完成 / 学习中 / 已完成）。标「已完成」时先显示「正在执行操作」，成功后再变为已完成并提示「本次执行已成功」；词条会分批进入
        <a href="/jp-vocab" style={{ color: "var(--accent)" }}>
          日语单词抽问
        </a>
        。若中断可再标一次「已完成」。
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
      {vocabSyncProgress ? (
        <div style={{ marginBottom: "0.75rem", maxWidth: "28rem" }}>
          <JpVocabSaveProgressBar
            label={vocabSyncProgress.label}
            percent={vocabSyncProgress.percent}
            fullWidth
          />
        </div>
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
        <JpLessonPageSections
          searchActive={searchActive}
          searchQuery={searchQuery}
          mobileStatusFilter={mobileStatusFilter}
          setMobileStatusFilter={setMobileStatusFilter}
          pendingKindFilter={pendingKindFilter}
          setPendingKindFilter={setPendingKindFilter}
          pendingKindCounts={pendingKindCounts}
          refreshing={refreshing}
          lessonsByStatus={lessonsByStatus}
          displayGroupsByStatus={displayGroupsByStatus}
          learningDayToneByDate={learningDayToneByDate}
          inClassLessons={inClassLessons}
          inClassDisplayGroups={inClassDisplayGroups}
          inClassDayToneByDate={inClassDayToneByDate}
          sectionSort={sectionSort}
          isAdmin={isAdmin}
          batchLessonIds={batchLessonIds}
          setBatchModalOpen={setBatchModalOpen}
          setBatchLessonIds={setBatchLessonIds}
          teachers={teachers}
          refs={refs}
          teacherById={teacherById}
          noteCountByLesson={noteCountByLesson}
          canOperate={canOperate}
          savingId={savingId}
          savingNextClassId={savingNextClassId}
          deletingId={deletingId}
          expandedContentIds={expandedContentIds}
          expandedMeaningsIds={expandedMeaningsIds}
          copiedId={copiedId}
          copiedBatchKey={copiedBatchKey}
          setLessonProgress={setLessonProgress}
          openTeacherEditModal={openTeacherEditModal}
          openNextClassEditModal={openNextClassEditModal}
          setEditingLesson={setEditingLesson}
          setEditingContentLesson={setEditingContentLesson}
          setViewingWordsLesson={setViewingWordsLesson}
          setAnnotatingLesson={setAnnotatingLesson}
          setViewingExamples={setViewingExamples}
          deleteLesson={deleteLesson}
          toggleRecentOperationSort={toggleRecentOperationSort}
          toggleClassTimeSort={toggleClassTimeSort}
          toggleBatchLesson={toggleBatchLesson}
          toggleContentExpanded={toggleContentExpanded}
          toggleMeaningsExpanded={toggleMeaningsExpanded}
          handleLessonLinkCopied={handleLessonLinkCopied}
          handleBatchLinkCopied={handleBatchLinkCopied}
          handleLessonLinkCopyError={handleLessonLinkCopyError}
          mergeBusy={mergeBusy}
          onCopyCourseMerge={copyCourseMerge}
        />
        </>
      )}

      <JpLessonPageModals
        locale={locale}
        canOperate={canOperate}
        isAdmin={isAdmin}
        teachers={teachers}
        editingTeacherLesson={editingTeacherLesson}
        editingTeacherLessonIds={editingTeacherLessonIds}
        savingTeacherLessonId={savingTeacherLessonId}
        editingNextClassLesson={editingNextClassLesson}
        savingNextClassId={savingNextClassId}
        batchModalOpen={batchModalOpen}
        batchLessonIds={batchLessonIds}
        batchSaving={batchSaving}
        editingLesson={editingLesson}
        editingRef={editingRef}
        editingContentLesson={editingContentLesson}
        savingContentId={savingContentId}
        viewingWordsLesson={viewingWordsLesson}
        annotatingLesson={annotatingLesson}
        viewingExamples={viewingExamples}
        setEditingTeacherLesson={setEditingTeacherLesson}
        setEditingTeacherLessonIds={setEditingTeacherLessonIds}
        addLessonTeacher={addLessonTeacher}
        updateLessonTeacher={updateLessonTeacher}
        deleteLessonTeacher={deleteLessonTeacher}
        setLessonTeachersForMany={setLessonTeachersForMany}
        setEditingNextClassLesson={setEditingNextClassLesson}
        setLessonClassSchedules={setLessonClassSchedules}
        openTeacherEditModal={openTeacherEditModal}
        setBatchModalOpen={setBatchModalOpen}
        setBatchClassSchedulesAndTeachers={setBatchClassSchedulesAndTeachers}
        setEditingLesson={setEditingLesson}
        setEditingContentLesson={setEditingContentLesson}
        setViewingWordsLesson={setViewingWordsLesson}
        saveLessonContentMeanings={saveLessonContentMeanings}
        handleRefUpdated={handleRefUpdated}
        openJpAuth={openJpAuth}
        setAnnotatingLesson={setAnnotatingLesson}
        handleAnnotateSaved={handleAnnotateSaved}
        setViewingExamples={setViewingExamples}
      />

      <JpLessonApiUploadDocs />
        </>
      )}

      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />
      <JpLessonPageStyles />
    </main>
  );
}
