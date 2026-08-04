"use client";

import dynamic from "next/dynamic";
import { CopyToast } from "@/components/CopyToast";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabDailyQuizIntroModal } from "@/components/JpVocabDailyQuizIntroModal";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpVocabManualAddModal } from "@/components/JpVocabManualAddModal";
import { JpVocabMnemonicViewModal } from "@/components/JpVocabMnemonicViewModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabResetChoiceModal } from "@/components/JpVocabResetChoiceModal";
import { JpVocabShareRequestModal } from "@/components/JpVocabShareRequestModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import { JpVocabTeacherQuizIntroModal } from "@/components/JpVocabTeacherQuizIntroModal";
import { JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import type { JpVocabCoachLevelCounts } from "@/lib/jp-vocab-coach";
import { SHOW_RISK_CHART } from "@/lib/jp-vocab-page-constants";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type {
  JpVocabLevel,
  JpVocabRef,
  JpVocabShareRequest,
  JpVocabWord,
} from "@/lib/types";
import type { Locale } from "@/i18n/messages";

const JpVocabExportChoiceModal = dynamic(
  () =>
    import("@/components/JpVocabExportChoiceModal").then(
      (m) => m.JpVocabExportChoiceModal
    ),
  { ssr: false }
);
const JpVocabRiskChartModal = dynamic(
  () =>
    import("@/components/JpVocabRiskChartModal").then(
      (m) => m.JpVocabRiskChartModal
    ),
  { ssr: false }
);

type JpVocabPageModalsProps = {
  locale: Locale;
  userId: number | undefined;
  isAdminMode: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  canManualAdd: boolean;
  teacherShareUiEnabled: boolean;
  showTeacherCoachEntry: boolean;
  showExportChoice: boolean;
  showResetChoice: boolean;
  showManualAdd: boolean;
  showRiskChart: boolean;
  showDailyIntro: boolean;
  showDailyComplete: boolean;
  showShareRequestModal: boolean;
  showTeacherQuizIntro: boolean;
  showQuizFlashcard: boolean;
  exporting: boolean;
  resetting: boolean;
  dailyQuizTotal: number;
  dailyCoachLevelCounts: JpVocabCoachLevelCounts;
  shareRequests: JpVocabShareRequest[];
  quizSession: JpVocabTeacherQuizSession | null;
  quizCardPreviewSession: JpVocabTeacherQuizSession | null;
  quizTargetWords: JpVocabWord[];
  words: JpVocabWord[];
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  reviewLockedByWordId: Record<number, boolean>;
  quizFlashcardSavingWordId: number | null;
  wordSyncState: Record<number, "queued" | "syncing">;
  dailySeqByWordId: Map<number, number>;
  displayQuizProgress: JpVocabDailyQuizProgress;
  quizTimeWeight: number;
  shareProgressMap: Record<number, number | null>;
  sharedTodayWordIds: Set<number>;
  studentPeekedCurrentWord: boolean;
  todayWeakExportWordsCount: number;
  copyToast: string | null;
  viewingRemarksWord: JpVocabWord | null;
  viewingMnemonicWord: JpVocabWord | null;
  previewRef: { ref: JpVocabRef; cacheVersion?: string | null } | null;
  editingRemarksWord: JpVocabWord | null;
  editingWord: JpVocabWord | null;
  onExportChoiceClose: () => void;
  onExport: (scope: "all" | "today_weak") => void;
  onExportExcel: () => void;
  onExportToCoach: () => void;
  onResetChoiceClose: () => void;
  onResetToday: () => void;
  onResetAll: () => void;
  onManualAddClose: () => void;
  onWordAdded: (added: JpVocabWord, ref?: JpVocabRef, refDeduped?: boolean) => void;
  onRiskChartClose: () => void;
  onDailyIntroClose: () => void;
  onDailyCompleteClose: () => void;
  onDailyCompleteViewLastWord?: () => void;
  onGoToCoach: (() => void) | undefined;
  onDismissShareRequests: () => void;
  onTeacherQuizIntroConfirm: () => void;
  onTeacherQuizIntroClose: () => void;
  onQuizFlashcardClose: () => void;
  onQuizComplete: () => void;
  onRecordLevel: (wordId: number, level: JpVocabLevel) => void;
  onQuizNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onOpenRemarks: (word: JpVocabWord) => void;
  onEditRemarks: (word: JpVocabWord | null) => void;
  onEditWord: (word: JpVocabWord | null) => void;
  onShare: (wordId: number) => void | Promise<boolean | void>;
  onEnsureSharedBeforeNext?: (wordId: number) => Promise<boolean>;
  onUnshare: (wordId: number) => void;
  onWordSaved: (word: JpVocabWord) => void;
  onWordSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onRefUpdated: (ref: JpVocabRef) => void;
  onNeedAuth: () => void;
  onSharedToStudy: (wordId: number) => void;
  onCloseQuizPreview: () => void;
  onNavigateQuizPreview: (index: number) => void;
  onCloseViewingRemarks: () => void;
  onCloseViewingMnemonic: () => void;
  onClosePreviewRef: () => void;
  onCloseEditingRemarks: () => void;
  onCloseEditingWord: () => void;
  onCopyToastDismiss: () => void;
};

export function JpVocabPageModals(props: JpVocabPageModalsProps) {
  const nestedModalOpen =
    props.viewingRemarksWord != null ||
    props.previewRef != null ||
    props.editingRemarksWord != null ||
    props.editingWord != null;

  return (
    <>
      <JpVocabExportChoiceModal
        open={props.showExportChoice}
        busy={props.exporting}
        allCount={props.words.length}
        todayWeakCount={props.todayWeakExportWordsCount}
        onClose={props.onExportChoiceClose}
        onExport={props.onExport}
        onExportExcel={props.onExportExcel}
        onExportToCoach={props.onExportToCoach}
      />

      <JpVocabResetChoiceModal
        open={props.showResetChoice}
        busy={props.resetting}
        onClose={props.onResetChoiceClose}
        onResetToday={props.onResetToday}
        onResetAll={props.onResetAll}
      />

      {props.canManualAdd ? (
        <JpVocabManualAddModal
          open={props.showManualAdd}
          locale={props.locale}
          onClose={props.onManualAddClose}
          onAdded={props.onWordAdded}
        />
      ) : null}

      {SHOW_RISK_CHART ? (
        <JpVocabRiskChartModal
          open={props.showRiskChart}
          words={props.quizTargetWords}
          timeWeight={props.quizTimeWeight}
          onClose={props.onRiskChartClose}
        />
      ) : null}

      {props.userId != null && !props.isAdminMode ? (
        <JpVocabDailyQuizIntroModal
          userId={props.userId}
          open={props.showDailyIntro}
          onClose={props.onDailyIntroClose}
        />
      ) : null}

      {props.userId != null && !props.isAdminMode ? (
        <JpVocabDailyQuizCompleteModal
          open={props.showDailyComplete}
          total={props.dailyQuizTotal}
          variant="teacher"
          levelCounts={props.dailyCoachLevelCounts}
          onGoToCoach={props.onGoToCoach}
          onViewLastWord={props.onDailyCompleteViewLastWord}
          onClose={props.onDailyCompleteClose}
        />
      ) : null}

      {JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED ? (
        <JpVocabShareRequestModal
          open={props.showShareRequestModal}
          requests={props.shareRequests}
          onClose={props.onDismissShareRequests}
        />
      ) : null}

      <JpVocabRemarksViewModal
        open={props.viewingRemarksWord != null}
        word={props.viewingRemarksWord}
        canDelete={props.canOperate}
        onClose={props.onCloseViewingRemarks}
        onWordUpdated={props.onWordSaved}
        onSaveFailed={props.onWordSaveFailed}
        onNeedAuth={props.onNeedAuth}
      />

      <JpVocabMnemonicViewModal
        open={props.viewingMnemonicWord != null}
        word={props.viewingMnemonicWord}
        onClose={props.onCloseViewingMnemonic}
      />

      <CopyToast message={props.copyToast} onDismiss={props.onCopyToastDismiss} />

      <JpVocabRefPreviewModal
        open={props.previewRef != null}
        refMeta={props.previewRef?.ref ?? null}
        cacheVersion={props.previewRef?.cacheVersion}
        onClose={props.onClosePreviewRef}
      />

      <JpClassNotesEditModal
        open={props.editingRemarksWord != null}
        word={props.editingRemarksWord}
        locale={props.locale}
        canEdit={props.canOperate}
        sharedToday={
          props.editingRemarksWord != null &&
          props.sharedTodayWordIds.has(props.editingRemarksWord.id)
        }
        sharePromptOnSave={props.showQuizFlashcard}
        onClose={props.onCloseEditingRemarks}
        onSaved={props.onWordSaved}
        onSaveFailed={props.onWordSaveFailed}
        onNeedAuth={props.onNeedAuth}
        onSharedToStudy={props.onSharedToStudy}
      />

      <JpVocabEditModal
        open={props.editingWord != null}
        word={props.editingWord}
        refs={props.refs}
        locale={props.locale}
        canEdit={props.canOperate}
        showMnemonic={props.isAdmin}
        onClose={props.onCloseEditingWord}
        onSaved={props.onWordSaved}
        onRefUpdated={props.onRefUpdated}
        onSaveFailed={props.onWordSaveFailed}
        onNeedAuth={props.onNeedAuth}
      />

      {props.userId != null ? (
        <JpVocabTeacherQuizIntroModal
          userId={props.userId}
          open={props.showTeacherQuizIntro}
          onConfirm={props.onTeacherQuizIntroConfirm}
          onClose={props.onTeacherQuizIntroClose}
        />
      ) : null}

      <JpVocabTeacherQuizFlashcardModal
        open={props.showQuizFlashcard}
        session={props.quizSession}
        wordsById={props.wordsById}
        refs={props.refs}
        locale={props.locale}
        displayOrder={props.displayOrder}
        sessionLevel={props.sessionLevel}
        reviewLockedByWordId={props.reviewLockedByWordId}
        savingWordId={props.quizFlashcardSavingWordId}
        wordSyncState={props.wordSyncState}
        dailySeqByWordId={props.dailySeqByWordId}
        dailyQuizProgress={props.displayQuizProgress}
        quizTimeWeight={props.quizTimeWeight}
        canOperate={props.canOperate}
        shareUiEnabled={props.teacherShareUiEnabled}
        shareProgressMap={props.shareProgressMap as Record<number, number>}
        sharedTodayWordIds={props.sharedTodayWordIds}
        studentPeeked={props.studentPeekedCurrentWord}
        onClose={props.onQuizFlashcardClose}
        onComplete={props.onQuizComplete}
        onSelectLevel={(wordId, level) => props.onRecordLevel(wordId, level)}
        onNavigate={props.onQuizNavigate}
        onOpenRef={props.onOpenRef}
        onViewRemarks={props.onOpenRemarks}
        onEditRemarks={props.onEditRemarks}
        onEditWord={props.onEditWord}
        onShare={props.onShare}
        onEnsureSharedBeforeNext={props.onEnsureSharedBeforeNext}
        onUnshare={props.onUnshare}
        onWordUpdated={props.onWordSaved}
        nestedModalOpen={nestedModalOpen}
        canManualFillExamples={props.isAdmin}
      />

      {props.quizCardPreviewSession != null ? (
        <JpVocabTeacherQuizFlashcardModal
          open
          session={props.quizCardPreviewSession}
          wordsById={props.wordsById}
          refs={props.refs}
          locale={props.locale}
          displayOrder={props.displayOrder}
          sessionLevel={props.sessionLevel}
          reviewLockedByWordId={props.reviewLockedByWordId}
          savingWordId={null}
          dailySeqByWordId={props.dailySeqByWordId}
          dailyQuizProgress={null}
          quizTimeWeight={props.quizTimeWeight}
          canOperate
          shareUiEnabled={false}
          previewMode
          canManualFillExamples={props.isAdmin}
          onClose={props.onCloseQuizPreview}
          onComplete={props.onCloseQuizPreview}
          onSelectLevel={() => {
            /* 预览只读 */
          }}
          onNavigate={props.onNavigateQuizPreview}
          onOpenRef={props.onOpenRef}
          onViewRemarks={props.onOpenRemarks}
          onEditRemarks={props.onEditRemarks}
          onEditWord={props.onEditWord}
          onWordUpdated={props.onWordSaved}
          nestedModalOpen={nestedModalOpen}
        />
      ) : null}
    </>
  );
}
