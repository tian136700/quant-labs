"use client";

import { EnVocabPageHelp } from "@/components/en-vocab-page/EnVocabPageHelp";
import { EnVocabPageSearch } from "@/components/en-vocab-page/EnVocabPageSearch";
import { EnVocabPagination } from "@/components/en-vocab-page/EnVocabPagination";
import { EnVocabTeacherQuizResumePanel } from "@/components/en-vocab-page/EnVocabTeacherQuizResumePanel";
import {
  EnVocabTeacherQuizStartPanel,
  type EnVocabTeacherQuizPendingWord,
} from "@/components/en-vocab-page/EnVocabTeacherQuizStartPanel";
import { EnVocabWordTable } from "@/components/en-vocab-page/EnVocabWordTable";
import { VocabTeacherDailyQuizDonePanel } from "@/components/VocabTeacherDailyQuizDonePanel";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import type { EnVocabKindFilter } from "@/lib/en-vocab-search";
import type { EnVocabStatSortKey } from "@/lib/en-vocab-shared";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export type EnVocabPageWordListProps = {
  locale: Locale;
  loading: boolean;
  isAdminMode: boolean;
  canOperate: boolean;
  canManualAdd: boolean;
  wordsLength: number;
  hideTeacherQuizList: boolean;
  /** 老师端未开始抽查时的开场页（无完整可点词表；可有只读待抽列表） */
  showTeacherQuizStartLanding?: boolean;
  teacherQuizInProgress?: boolean;
  remainingQuizCount?: number;
  /** 开场页左侧只读待抽单词（与 remainingQuizCount 一致） */
  pendingQuizWords?: EnVocabTeacherQuizPendingWord[];
  showQuizFlashcard: boolean;
  showVocabHelp: boolean;
  searchQuery: string;
  kindFilter: EnVocabKindFilter;
  filterActive: boolean;
  searchActive: boolean;
  teacherShareUiEnabled: boolean;
  statSort: { key: EnVocabStatSortKey; dir: "asc" | "desc" };
  filteredDisplayedWords: EnVocabWord[];
  displayedWordsCount: number;
  pagedDisplayedWords: EnVocabWord[];
  safePage: number;
  totalPages: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  pageSize: number;
  highlightId: number | null;
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  savingId: number | null;
  sharingId: number | null;
  deletingBatch: boolean;
  sharedTodayWordIds: Set<number>;
  reviewLockedByWordId: Record<number, boolean>;
  refs: Record<string, EnVocabRef>;
  dailySeqByWordId: Map<number, number>;
  quizTarget: number;
  teacherQuizLocksTable: boolean;
  isWordInQuizTarget: (wordId: number) => boolean;
  quizSession: EnVocabTeacherQuizSession | null;
  dailyQuizComplete?: boolean;
  selectedDeleteIds: Set<number>;
  allPageDeleteSelected: boolean;
  somePageDeleteSelected: boolean;
  pagedDeleteIds: number[];
  onToggleVocabHelp: () => void;
  onResumeTeacherQuiz: () => void;
  onStartTeacherQuiz?: () => void;
  onViewLastCheckedWord?: () => void;
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: EnVocabKindFilter) => void;
  onClearSearch: () => void;
  onPageChange: (updater: (page: number) => number) => void;
  onPageSizeChange: (size: number) => void;
  onStatSort: (key: EnVocabStatSortKey) => void;
  onToggleSelectAllPageForDelete: () => void;
  onToggleDeleteSelection: (wordId: number, checked: boolean) => void;
  onRefPreview: (refKey: string, ref?: EnVocabRef) => void;
  onViewUsage: (word: EnVocabWord | null) => void;
  onViewMnemonic: (word: EnVocabWord | null) => void;
  onViewRemarks: (word: EnVocabWord | null) => void;
  onEditRemarks: (word: EnVocabWord | null) => void;
  onEditWord: (word: EnVocabWord | null) => void;
  onPreviewQuizCard: (wordId: number) => void;
  onDeleteWord: (word: EnVocabWord) => void;
  onShareWord: (wordId: number) => void;
  onRecordLevel: (wordId: number, level: EnVocabLevel) => void;
  onResumeQuiz: (wordId?: number) => void;
  onRequestQuizMode: (wordId: number) => void;
  onStatus: (message: string) => void;
};

export function EnVocabPageWordList(props: EnVocabPageWordListProps) {
  const {
    locale,
    loading,
    isAdminMode,
    canOperate,
    canManualAdd,
    wordsLength,
    hideTeacherQuizList,
    showTeacherQuizStartLanding = false,
    teacherQuizInProgress = false,
    remainingQuizCount = 0,
    pendingQuizWords = [],
    showQuizFlashcard,
    showVocabHelp,
    searchQuery,
    kindFilter,
    filterActive,
    searchActive,
    teacherShareUiEnabled,
    statSort,
    filteredDisplayedWords,
    displayedWordsCount,
    pagedDisplayedWords,
    safePage,
    totalPages,
    pageRangeStart,
    pageRangeEnd,
    pageSize,
    highlightId,
    displayOrder,
    sessionLevel,
    savingId,
    sharingId,
    deletingBatch,
    sharedTodayWordIds,
    reviewLockedByWordId,
    refs,
    dailySeqByWordId,
    quizTarget,
    teacherQuizLocksTable,
    isWordInQuizTarget,
    quizSession,
    selectedDeleteIds,
    allPageDeleteSelected,
    somePageDeleteSelected,
    pagedDeleteIds,
    onToggleVocabHelp,
    onResumeTeacherQuiz,
    onStartTeacherQuiz,
    onSearchChange,
    onKindFilterChange,
    onClearSearch,
    onPageChange,
    onPageSizeChange,
    onStatSort,
    onToggleSelectAllPageForDelete,
    onToggleDeleteSelection,
    onRefPreview,
    onViewUsage,
    onViewMnemonic,
    onViewRemarks,
    onEditRemarks,
    onEditWord,
    onPreviewQuizCard,
    onDeleteWord,
    onShareWord,
    onRecordLevel,
    onResumeQuiz,
    onRequestQuizMode,
    onStatus,
  } = props;

  return (
    <>
      {!loading && wordsLength ? (
        <EnVocabPageHelp
          locale={locale}
          expanded={showVocabHelp}
          onToggle={onToggleVocabHelp}
        />
      ) : null}

      {loading && !wordsLength ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : !wordsLength ? (
        <p style={{ color: "var(--muted)" }}>
          暂无条目。复习词表由「英语新课」自动导入
          {canManualAdd ? "，也可登录后点「手动添加」补充" : ""}。
        </p>
      ) : hideTeacherQuizList ? (
        showTeacherQuizStartLanding && !teacherQuizInProgress ? (
          <EnVocabTeacherQuizStartPanel
            remainingCount={remainingQuizCount}
            pendingWords={pendingQuizWords}
            loading={loading}
            onStart={() => onStartTeacherQuiz?.()}
          />
        ) : (
          <EnVocabTeacherQuizResumePanel
            showQuizFlashcard={showQuizFlashcard}
            onResume={onResumeTeacherQuiz}
          />
        )
      ) : (
        <>
          {!isAdminMode &&
          canOperate &&
          props.dailyQuizComplete &&
          props.onViewLastCheckedWord ? (
            <VocabTeacherDailyQuizDonePanel
              title="本轮单词已抽查完成"
              subtitle="点「查看上一个单词」可回看；您也可以选择关闭当前页面。"
              onViewLastWord={props.onViewLastCheckedWord}
              viewLastDisabled={filteredDisplayedWords.length === 0}
            />
          ) : null}
          <EnVocabPageSearch
            loading={loading}
            searchQuery={searchQuery}
            kindFilter={kindFilter}
            filterActive={filterActive}
            searchActive={searchActive}
            filteredCount={filteredDisplayedWords.length}
            displayedCount={displayedWordsCount}
            onSearchChange={onSearchChange}
            onKindFilterChange={onKindFilterChange}
            onClear={onClearSearch}
          />
          {filteredDisplayedWords.length ? (
            <>
              <EnVocabPagination
                safePage={safePage}
                totalPages={totalPages}
                pageRangeStart={pageRangeStart}
                pageRangeEnd={pageRangeEnd}
                totalItems={filteredDisplayedWords.length}
                pageSize={pageSize}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
              <EnVocabWordTable
                locale={locale}
                loading={loading}
                isAdmin={isAdminMode}
                canOperate={canOperate}
                teacherShareUiEnabled={teacherShareUiEnabled}
                statSort={statSort}
                onStatSort={onStatSort}
                words={pagedDisplayedWords}
                highlightId={highlightId}
                displayOrder={displayOrder}
                sessionLevel={sessionLevel}
                savingId={savingId}
                sharingId={sharingId}
                deletingBatch={deletingBatch}
                sharedTodayWordIds={sharedTodayWordIds}
                reviewLockedByWordId={reviewLockedByWordId}
                refs={refs}
                dailySeqByWordId={dailySeqByWordId}
                quizTarget={quizTarget}
                teacherQuizLocksTable={teacherQuizLocksTable}
                isWordInQuizTarget={isWordInQuizTarget}
                quizSession={quizSession}
                selectedDeleteIds={selectedDeleteIds}
                allPageDeleteSelected={allPageDeleteSelected}
                somePageDeleteSelected={somePageDeleteSelected}
                pagedDeleteIds={pagedDeleteIds}
                onToggleSelectAllPageForDelete={onToggleSelectAllPageForDelete}
                onToggleDeleteSelection={onToggleDeleteSelection}
                onRefPreview={onRefPreview}
                onViewUsage={onViewUsage}
                onViewMnemonic={onViewMnemonic}
                onViewRemarks={onViewRemarks}
                onEditRemarks={onEditRemarks}
                onEditWord={onEditWord}
                onPreviewQuizCard={onPreviewQuizCard}
                onDeleteWord={onDeleteWord}
                onShareWord={onShareWord}
                onRecordLevel={onRecordLevel}
                onResumeQuiz={onResumeQuiz}
                onRequestQuizMode={onRequestQuizMode}
                onStatus={onStatus}
              />
              <EnVocabPagination
                safePage={safePage}
                totalPages={totalPages}
                pageRangeStart={pageRangeStart}
                pageRangeEnd={pageRangeEnd}
                totalItems={filteredDisplayedWords.length}
                pageSize={pageSize}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
