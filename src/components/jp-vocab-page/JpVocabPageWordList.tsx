"use client";

import { JpVocabPageHelp } from "@/components/jp-vocab-page/JpVocabPageHelp";
import { JpVocabPageSearch } from "@/components/jp-vocab-page/JpVocabPageSearch";
import { JpVocabPagination } from "@/components/jp-vocab-page/JpVocabPagination";
import { JpVocabTeacherQuizResumePanel } from "@/components/jp-vocab-page/JpVocabTeacherQuizResumePanel";
import { JpVocabWordTable } from "@/components/jp-vocab-page/JpVocabWordTable";
import { VocabTeacherDailyQuizDonePanel } from "@/components/VocabTeacherDailyQuizDonePanel";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabQuizPriorityBoost } from "@/lib/jp-vocab-quiz-priority-boost";
import type { JpVocabKindFilter } from "@/lib/jp-vocab-search";
import type { JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export type JpVocabPageWordListProps = {
  locale: Locale;
  loading: boolean;
  isAdminMode: boolean;
  canOperate: boolean;
  canManualAdd: boolean;
  wordsLength: number;
  hideTeacherQuizList: boolean;
  showQuizFlashcard: boolean;
  showVocabHelp: boolean;
  quizTimeWeight: number;
  searchQuery: string;
  kindFilter: JpVocabKindFilter;
  filterActive: boolean;
  searchActive: boolean;
  useDailyRowOrder: boolean;
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" };
  hideInoperableRows: boolean;
  dailyQuizComplete: boolean;
  filteredDisplayedWords: JpVocabWord[];
  searchMatchedWords: JpVocabWord[];
  pagedDisplayedWords: JpVocabWord[];
  safePage: number;
  totalPages: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  pageSize: number;
  highlightId: number | null;
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  sessionReviewAt: Record<number, number>;
  wordSyncState: Record<number, "queued" | "syncing">;
  deletingId: number | null;
  shareProgressMap: Record<number, number | null>;
  sharedTodayWordIds: Set<number>;
  refs: Record<string, JpVocabRef>;
  dailySeqByWordId: Map<number, number>;
  quizTarget: number;
  teacherQuizLocksTable: boolean;
  quizSession: JpVocabTeacherQuizSession | null;
  quizPriorityBoost: JpVocabQuizPriorityBoost | null;
  boostingWordId: number | null;
  isWordInQuizTarget: (wordId: number) => boolean;
  isWordReviewLocked: (word: JpVocabWord, sessionReviewAtMs?: number) => boolean;
  onToggleVocabHelp: () => void;
  onResumeTeacherQuiz: () => void;
  /** 今日抽完：回看最后一个词 */
  onViewLastCheckedWord?: () => void;
  coachAction?: {
    busy: boolean;
    coachCount: number;
    onClick: () => void;
  };
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: JpVocabKindFilter) => void;
  onClearSearch: () => void;
  onRestoreDailyRowOrder: () => void;
  onToggleStatSort: (key: JpVocabStatSortKey) => void;
  openRemarksWord: (word: JpVocabWord) => void;
  onEditRemarks: (word: JpVocabWord | null) => void;
  onReadingCopy: (readingTrim: string, wordTrim: string) => void;
  onRefPreview: (refKey: string, ref?: JpVocabRef) => void;
  onEditWord: (word: JpVocabWord | null) => void;
  onDeleteWord: (word: JpVocabWord) => void;
  onBoostQuizPriority?: (word: JpVocabWord) => void;
  onPreviewQuizCard?: (word: JpVocabWord) => void;
  onViewMnemonic: (word: JpVocabWord | null) => void;
  onRecordLevel: (wordId: number, level: JpVocabLevel) => void;
  onResumeQuiz: (wordId?: number) => void;
  onRequestQuizMode: (wordId: number) => void;
  onStatus: (message: string) => void;
  onPageChange: (updater: (page: number) => number) => void;
  onPageSizeChange: (size: number) => void;
};

export function JpVocabPageWordList(props: JpVocabPageWordListProps) {
  if (props.loading) {
    return <p style={{ color: "var(--muted)" }}>加载中…</p>;
  }
  if (!props.wordsLength) {
    return (
      <p style={{ color: "var(--muted)" }}>
        暂无条目。复习词表由「日语新课」自动导入
        {props.canManualAdd ? "，也可点「手动添加」补充" : ""}。
      </p>
    );
  }

  const help = (
    <JpVocabPageHelp
      locale={props.locale}
      quizTimeWeight={props.quizTimeWeight}
      expanded={props.showVocabHelp}
      onToggle={props.onToggleVocabHelp}
    />
  );

  if (props.hideTeacherQuizList) {
    return (
      <>
        {help}
        <JpVocabTeacherQuizResumePanel
          showQuizFlashcard={props.showQuizFlashcard}
          onResume={props.onResumeTeacherQuiz}
        />
      </>
    );
  }

  return (
    <>
      {help}
      {!props.isAdminMode &&
      props.canOperate &&
      props.dailyQuizComplete &&
      props.onViewLastCheckedWord ? (
        <VocabTeacherDailyQuizDonePanel
          title="今日抽查已完成"
          subtitle="点「查看上一个单词」打开本轮最后一个词；卡片内可再点「上一个」往前翻。"
          onViewLastWord={props.onViewLastCheckedWord}
          viewLastDisabled={props.filteredDisplayedWords.length === 0}
          coachAction={props.coachAction}
        />
      ) : null}
      <JpVocabPageSearch
        locale={props.locale}
        loading={props.loading}
        searchQuery={props.searchQuery}
        kindFilter={props.kindFilter}
        filterActive={props.filterActive}
        searchActive={props.searchActive}
        useDailyRowOrder={props.useDailyRowOrder}
        statSort={props.statSort}
        quizTimeWeight={props.quizTimeWeight}
        hideInoperableRows={props.hideInoperableRows}
        dailyQuizComplete={props.dailyQuizComplete}
        filteredCount={props.filteredDisplayedWords.length}
        searchMatchedCount={props.searchMatchedWords.length}
        onSearchChange={props.onSearchChange}
        onKindFilterChange={props.onKindFilterChange}
        onClear={props.onClearSearch}
        onRestoreDailyRowOrder={props.onRestoreDailyRowOrder}
        onToggleStatSort={props.onToggleStatSort}
      />
      {props.filteredDisplayedWords.length ? (
        <>
          <JpVocabWordTable
            locale={props.locale}
            isAdmin={props.isAdminMode}
            canOperate={props.canOperate}
            statSort={props.statSort}
            onStatSort={props.onToggleStatSort}
            words={props.pagedDisplayedWords}
            highlightId={props.highlightId}
            displayOrder={props.displayOrder}
            sessionLevel={props.sessionLevel}
            sessionReviewAt={props.sessionReviewAt}
            wordSyncState={props.wordSyncState}
            deletingId={props.deletingId}
            shareProgressMap={props.shareProgressMap as Record<number, number>}
            sharedTodayWordIds={props.sharedTodayWordIds}
            refs={props.refs}
            dailySeqByWordId={props.dailySeqByWordId}
            quizTarget={props.quizTarget}
            quizTimeWeight={props.quizTimeWeight}
            teacherQuizLocksTable={props.teacherQuizLocksTable}
            isWordInQuizTarget={props.isWordInQuizTarget}
            isWordReviewLocked={props.isWordReviewLocked}
            quizSession={props.quizSession}
            openRemarksWord={props.openRemarksWord}
            onEditRemarks={props.onEditRemarks}
            onReadingCopy={props.onReadingCopy}
            onRefPreview={props.onRefPreview}
            onEditWord={props.onEditWord}
            onDeleteWord={props.onDeleteWord}
            onBoostQuizPriority={props.onBoostQuizPriority}
            quizPriorityBoost={props.quizPriorityBoost}
            boostingWordId={props.boostingWordId}
            onPreviewQuizCard={props.onPreviewQuizCard}
            onViewMnemonic={props.onViewMnemonic}
            onRecordLevel={props.onRecordLevel}
            onResumeQuiz={props.onResumeQuiz}
            onRequestQuizMode={props.onRequestQuizMode}
            onStatus={props.onStatus}
          />
          <JpVocabPagination
            safePage={props.safePage}
            totalPages={props.totalPages}
            pageRangeStart={props.pageRangeStart}
            pageRangeEnd={props.pageRangeEnd}
            totalItems={props.filteredDisplayedWords.length}
            pageSize={props.pageSize}
            onPageChange={props.onPageChange}
            onPageSizeChange={props.onPageSizeChange}
          />
        </>
      ) : null}
    </>
  );
}
