"use client";

import { JpLessonStatusTable } from "@/components/jp-lesson-page/JpLessonStatusTable";
import {
  JP_LESSON_IN_CLASS_SECTION,
  LESSON_STATUS_SECTIONS,
  type JpLessonSectionSort,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import { JpLessonPendingKindFilterBar } from "@/components/jp-lesson-page/JpLessonPendingKindFilterBar";
import type { JpLessonListFilter } from "@/lib/lesson-mobile-status-filter";
import {
  jpLessonPendingKindFilterEmptyHint,
  jpLessonPendingKindFilterVisibleCount,
  type JpLessonPendingKindCounts,
  type JpLessonPendingKindFilter,
} from "@/lib/jp-lesson-pending-kind-filter";
import type { JpLessonDisplayGroup, JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";

export type JpLessonPageSectionsProps = {
  searchActive: boolean;
  searchQuery: string;
  mobileStatusFilter: JpLessonListFilter;
  setMobileStatusFilter: (status: JpLessonListFilter) => void;
  pendingKindFilter: JpLessonPendingKindFilter;
  setPendingKindFilter: (kind: JpLessonPendingKindFilter) => void;
  pendingKindCounts: JpLessonPendingKindCounts;
  refreshing: boolean;
  lessonsByStatus: Record<JpLessonProgressStatus, JpLessonRecord[]>;
  displayGroupsByStatus: Record<JpLessonProgressStatus, JpLessonDisplayGroup<JpLessonRecord>[]>;
  learningDayToneByDate: Map<string, number>;
  inClassLessons: JpLessonRecord[];
  inClassDisplayGroups: JpLessonDisplayGroup<JpLessonRecord>[];
  inClassDayToneByDate: Map<string, number>;
  sectionSort: Record<JpLessonProgressStatus, JpLessonSectionSort>;
  isAdmin: boolean;
  batchLessonIds: number[];
  setBatchModalOpen: (open: boolean) => void;
  setBatchLessonIds: (ids: number[]) => void;
  onOpenAiPlanPrompt?: () => void;
  teachers: JpLessonTeacher[];
  refs: Record<string, JpVocabRef>;
  teacherById: Map<number, JpLessonTeacher>;
  noteCountByLesson: Map<number, number>;
  canOperate: boolean;
  savingId: number | null;
  savingNextClassId: number | null;
  deletingId: number | null;
  expandedContentIds: Record<number, boolean>;
  expandedMeaningsIds: Record<number, boolean>;
  copiedId: number | null;
  copiedBatchKey: string | null;
  setLessonProgress: (lessonId: number, status: JpLessonProgressStatus) => void;
  openTeacherEditModal: (lesson: JpLessonRecord, lessonIds?: number[]) => void;
  openNextClassEditModal: (lesson: JpLessonRecord) => void;
  setEditingLesson: (lesson: JpLessonRecord | null) => void;
  setEditingContentLesson: (lesson: JpLessonRecord | null) => void;
  setViewingWordsLesson: (lesson: JpLessonRecord | null) => void;
  setAnnotatingLesson: (payload: {
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    imageUrl: string;
    mediaType?: "image" | "pdf";
  } | null) => void;
  setViewingExamples: (target: import("@/components/JpLessonExamplesViewModal").JpLessonExamplesViewTarget | null) => void;
  deleteLesson: (lesson: JpLessonRecord) => void;
  toggleRecentOperationSort: (status: JpLessonProgressStatus) => void;
  toggleClassTimeSort: (status: JpLessonProgressStatus) => void;
  toggleBatchLesson: (lessonId: number) => void;
  toggleContentExpanded: (lessonId: number) => void;
  toggleMeaningsExpanded: (lessonId: number) => void;
  handleLessonLinkCopied: (lessonId: number) => void;
  handleBatchLinkCopied: (batchKey: string) => void;
  handleLessonLinkCopyError: () => void;
  mergeBusy?: import("@/components/JpLessonCopyMenu").JpLessonCourseMergeBusy;
  onCopyCourseMerge?: (pair: import("@/lib/jp-lesson-course-pair").JpLessonCoursePair) => void;
};

export function JpLessonPageSections(props: JpLessonPageSectionsProps) {
  const {
    searchActive,
    mobileStatusFilter,
    setMobileStatusFilter,
    pendingKindFilter,
    setPendingKindFilter,
    pendingKindCounts,
    refreshing,
    lessonsByStatus,
    displayGroupsByStatus,
    learningDayToneByDate,
    inClassLessons,
    inClassDisplayGroups,
    inClassDayToneByDate,
    sectionSort,
    isAdmin,
    batchLessonIds,
    setBatchModalOpen,
    setBatchLessonIds,
    onOpenAiPlanPrompt,
    refs,
    teacherById,
    noteCountByLesson,
    canOperate,
    savingId,
    savingNextClassId,
    deletingId,
    expandedContentIds,
    expandedMeaningsIds,
    copiedId,
    copiedBatchKey,
    setLessonProgress,
    openTeacherEditModal,
    openNextClassEditModal,
    setEditingLesson,
    setEditingContentLesson,
    setViewingWordsLesson,
    setAnnotatingLesson,
    setViewingExamples,
    deleteLesson,
    toggleRecentOperationSort,
    toggleClassTimeSort,
    toggleBatchLesson,
    toggleContentExpanded,
    toggleMeaningsExpanded,
    handleLessonLinkCopied,
    handleBatchLinkCopied,
    handleLessonLinkCopyError,
    mergeBusy = null,
    onCopyCourseMerge,
  } = props;

  const inClassCount = inClassLessons.length;
  const inClassActive = mobileStatusFilter === "in_class";
  const showPendingKindFilter =
    !searchActive && mobileStatusFilter === "pending";
  const pendingVisibleCount = jpLessonPendingKindFilterVisibleCount(
    pendingKindCounts,
    pendingKindFilter
  );

  const tableSharedProps = {
    isAdmin,
    canOperate,
    refs,
    teacherById,
    noteCountByLesson,
    batchLessonIds,
    expandedContentIds,
    expandedMeaningsIds,
    savingId,
    savingNextClassId,
    deletingId,
    copiedId,
    copiedBatchKey,
    onToggleBatchLesson: toggleBatchLesson,
    onToggleContentExpanded: toggleContentExpanded,
    onToggleMeaningsExpanded: toggleMeaningsExpanded,
    onSetLessonProgress: setLessonProgress,
    onViewExamples: setViewingExamples,
    onEditLesson: setEditingLesson,
    onEditContent: setEditingContentLesson,
    onViewWords: setViewingWordsLesson,
    onAnnotateLesson: setAnnotatingLesson,
    onOpenTeacherEdit: openTeacherEditModal,
    onOpenNextClassEdit: openNextClassEditModal,
    onDeleteLesson: deleteLesson,
    onLessonLinkCopied: handleLessonLinkCopied,
    onBatchLinkCopied: handleBatchLinkCopied,
    onLessonLinkCopyError: handleLessonLinkCopyError,
    mergeBusy,
    onCopyCourseMerge,
  };

  return (
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
            <button
              type="button"
              role="tab"
              aria-selected={inClassActive}
              aria-label="上课中"
              className={`jp-lesson-mobile-status-tab jp-lesson-mobile-status-tab--in_class${
                inClassActive ? " is-active" : ""
              }`}
              onClick={() => setMobileStatusFilter("in_class")}
            >
              <span className="jp-lesson-mobile-status-tab-label">
                {JP_LESSON_IN_CLASS_SECTION.title}
              </span>
              <span className="jp-lesson-mobile-status-tab-count">{inClassCount}</span>
            </button>
          </div>
          {showPendingKindFilter ? (
            <JpLessonPendingKindFilterBar
              pendingKindFilter={pendingKindFilter}
              setPendingKindFilter={setPendingKindFilter}
              pendingKindCounts={pendingKindCounts}
            />
          ) : null}
          {LESSON_STATUS_SECTIONS.map(({ status, title, emptyHint }) => {
            const sectionGroups = displayGroupsByStatus[status];
            const sectionCount =
              status === "pending" && !searchActive
                ? pendingVisibleCount
                : lessonsByStatus[status].length;
            if (searchActive && !sectionCount) return null;
            const pendingEmptyHint =
              status === "pending" &&
              pendingKindFilter !== "all" &&
              pendingKindCounts.all > 0
                ? jpLessonPendingKindFilterEmptyHint(pendingKindFilter)
                : emptyHint;
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
                    <button
                      type="button"
                      className="jp-lesson-action-btn"
                      disabled={!batchLessonIds.length}
                      onClick={() => onOpenAiPlanPrompt?.()}
                      title="用勾选课的单词做 ChatGPT 教案提示词，并粘贴图片挂教案"
                    >
                      做教案提示词
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
                    onToggleRecentOperationSort={() =>
                      toggleRecentOperationSort(status)
                    }
                    onToggleClassTimeSort={() => toggleClassTimeSort(status)}
                    {...tableSharedProps}
                  />
                ) : searchActive ? null : (
                  <p className="jp-lesson-status-card-empty">{pendingEmptyHint}</p>
                )}
              </section>
            );
          })}
          {/* 搜索时不展示快捷区；点「上课中」看开课前/后 10 分钟窗口内的教案 */}
          {searchActive ? null : (
            <section
              className="section etr-panel jp-lesson-status-card jp-lesson-status-card--in_class"
              aria-label="上课中"
            >
              <div className="jp-lesson-status-card-head">
                <h2 className="jp-lesson-status-card-title">
                  {JP_LESSON_IN_CLASS_SECTION.title}
                </h2>
                <span className="jp-lesson-status-card-count">{inClassCount} 条</span>
              </div>
              {inClassCount ? (
                <JpLessonStatusTable
                  displayGroups={inClassDisplayGroups}
                  status="learning"
                  dayToneByDate={inClassDayToneByDate}
                  sectionSort={sectionSort.learning}
                  onToggleRecentOperationSort={() =>
                    toggleRecentOperationSort("learning")
                  }
                  onToggleClassTimeSort={() => toggleClassTimeSort("learning")}
                  {...tableSharedProps}
                />
              ) : (
                <p className="jp-lesson-status-card-empty">
                  {JP_LESSON_IN_CLASS_SECTION.emptyHint}
                </p>
              )}
            </section>
          )}
        </div>
  );
}
