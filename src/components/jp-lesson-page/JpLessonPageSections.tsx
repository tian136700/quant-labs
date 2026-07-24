"use client";

import { JpLessonStatusTable } from "@/components/jp-lesson-page/JpLessonStatusTable";
import {
  LESSON_STATUS_SECTIONS,
  type JpLessonSectionSort,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { JpLessonDisplayGroup, JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";

export type JpLessonPageSectionsProps = {
  searchActive: boolean;
  searchQuery: string;
  mobileStatusFilter: JpLessonProgressStatus;
  setMobileStatusFilter: (status: JpLessonProgressStatus) => void;
  refreshing: boolean;
  lessonsByStatus: Record<JpLessonProgressStatus, JpLessonRecord[]>;
  displayGroupsByStatus: Record<JpLessonProgressStatus, JpLessonDisplayGroup<JpLessonRecord>[]>;
  learningDayToneByDate: Map<string, number>;
  sectionSort: Record<JpLessonProgressStatus, JpLessonSectionSort>;
  isAdmin: boolean;
  batchLessonIds: number[];
  setBatchModalOpen: (open: boolean) => void;
  setBatchLessonIds: (ids: number[]) => void;
  teachers: JpLessonTeacher[];
  refs: Record<string, JpVocabRef>;
  teacherById: Map<number, JpLessonTeacher>;
  noteCountByLesson: Map<number, number>;
  canOperate: boolean;
  savingId: number | null;
  savingNextClassId: number | null;
  expandedContentIds: Record<number, boolean>;
  expandedMeaningsIds: Record<number, boolean>;
  copiedId: number | null;
  copiedBatchKey: string | null;
  setLessonProgress: (lessonId: number, status: JpLessonProgressStatus) => void;
  openTeacherEditModal: (lesson: JpLessonRecord, lessonIds?: number[]) => void;
  openNextClassEditModal: (lesson: JpLessonRecord) => void;
  setEditingLesson: (lesson: JpLessonRecord | null) => void;
  setAnnotatingLesson: (payload: { lesson: JpLessonRecord; ref: JpVocabRef; imageUrl: string } | null) => void;
  setViewingExamples: (target: import("@/components/JpLessonExamplesViewModal").JpLessonExamplesViewTarget | null) => void;
  toggleRecentOperationSort: (status: JpLessonProgressStatus) => void;
  toggleClassTimeSort: (status: JpLessonProgressStatus) => void;
  toggleBatchLesson: (lessonId: number) => void;
  toggleContentExpanded: (lessonId: number) => void;
  toggleMeaningsExpanded: (lessonId: number) => void;
  handleLessonLinkCopied: (lessonId: number) => void;
  handleBatchLinkCopied: (batchKey: string) => void;
  handleLessonLinkCopyError: () => void;
};

export function JpLessonPageSections(props: JpLessonPageSectionsProps) {
  const {
    searchActive,
    mobileStatusFilter,
    setMobileStatusFilter,
    refreshing,
    lessonsByStatus,
    displayGroupsByStatus,
    learningDayToneByDate,
    sectionSort,
    isAdmin,
    batchLessonIds,
    setBatchModalOpen,
    setBatchLessonIds,
    refs,
    teacherById,
    noteCountByLesson,
    canOperate,
    savingId,
    savingNextClassId,
    expandedContentIds,
    expandedMeaningsIds,
    copiedId,
    copiedBatchKey,
    setLessonProgress,
    openTeacherEditModal,
    openNextClassEditModal,
    setEditingLesson,
    setAnnotatingLesson,
    setViewingExamples,
    toggleRecentOperationSort,
    toggleClassTimeSort,
    toggleBatchLesson,
    toggleContentExpanded,
    toggleMeaningsExpanded,
    handleLessonLinkCopied,
    handleBatchLinkCopied,
    handleLessonLinkCopyError,
  } = props;

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
  );
}
