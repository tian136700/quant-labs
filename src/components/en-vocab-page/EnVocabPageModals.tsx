"use client";

import dynamic from "next/dynamic";
import { EnClassNotesEditModal } from "@/components/EnClassNotesEditModal";
import { EnVocabEditModal } from "@/components/EnVocabEditModal";
import { EnVocabManualAddModal } from "@/components/EnVocabManualAddModal";
import { EnVocabMnemonicViewModal } from "@/components/EnVocabMnemonicViewModal";
import { EnVocabRefPreviewModal } from "@/components/EnVocabRefPreviewModal";
import { EnVocabRemarksViewModal } from "@/components/EnVocabRemarksViewModal";
import { EnVocabResetChoiceModal } from "@/components/EnVocabResetChoiceModal";
import { EnVocabTeacherQuizFlashcardModal } from "@/components/EnVocabTeacherQuizFlashcardModal";
import { EnVocabUsageViewModal } from "@/components/EnVocabUsageViewModal";
import {
  EnVocabDailyQuizIntroModal,
} from "@/components/EnVocabDailyQuizIntroModal";
import { EnVocabTeacherQuizIntroModal } from "@/components/EnVocabTeacherQuizIntroModal";
import { SHOW_RISK_CHART } from "@/lib/en-vocab-page-constants";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import type { EnVocabDailyQuizProgress } from "@/lib/en-vocab-daily-quiz-progress";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

const EnVocabRiskChartModal = dynamic(
  () =>
    import("@/components/EnVocabRiskChartModal").then(
      (m) => m.EnVocabRiskChartModal
    ),
  { ssr: false }
);

type EnVocabPageModalsProps = {
  locale: Locale;
  userId: number | undefined;
  isAdminMode: boolean;
  canOperate: boolean;
  canManualAdd: boolean;
  teacherShareUiEnabled: boolean;
  showResetChoice: boolean;
  resetting: boolean;
  showManualAdd: boolean;
  showRiskChart: boolean;
  showDailyIntro: boolean;
  showTeacherQuizIntro: boolean;
  showQuizFlashcard: boolean;
  quizSession: EnVocabTeacherQuizSession | null;
  quizCardPreviewSession: EnVocabTeacherQuizSession | null;
  words: EnVocabWord[];
  wordsById: Map<number, EnVocabWord>;
  refs: Record<string, EnVocabRef>;
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  sessionUsageLevels: Record<number, Array<EnVocabLevel | null | undefined>>;
  reviewLockedByWordId: Record<number, boolean>;
  savingId: number | null;
  dailySeqByWordId: Map<number, number>;
  displayQuizProgress: EnVocabDailyQuizProgress;
  sharedTodayWordIds: Set<number>;
  studentPeekedCurrentWord: boolean;
  viewingRemarksWord: EnVocabWord | null;
  viewingMnemonicWord: EnVocabWord | null;
  viewingUsageWord: EnVocabWord | null;
  previewRef: { ref: EnVocabRef; cacheVersion?: string | null } | null;
  editingRemarksWord: EnVocabWord | null;
  editingWord: EnVocabWord | null;
  onResetChoiceClose: () => void;
  onResetToday: () => void;
  onResetAll: () => void;
  onManualAddClose: () => void;
  onWordAdded: (added: EnVocabWord, ref?: EnVocabRef, refDeduped?: boolean) => void;
  onRiskChartClose: () => void;
  onDailyIntroClose: () => void;
  onTeacherQuizIntroConfirm: () => void;
  onTeacherQuizIntroClose: () => void;
  onQuizFlashcardClose: () => void;
  onQuizComplete: () => void;
  onRecordLevel: (wordId: number, level: EnVocabLevel) => void;
  onRecordUsageLevels: (wordId: number, levels: Array<EnVocabLevel | null | undefined>) => void;
  onQuizNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: EnVocabRef) => void;
  onOpenRemarks: (word: EnVocabWord) => void;
  onEditRemarks: (word: EnVocabWord | null) => void;
  onEditWord: (word: EnVocabWord | null) => void;
  onShare: (wordId: number) => void;
  onWordSaved: (word: EnVocabWord) => void;
  onWordSaveFailed: (wordId: number, snapshot: EnVocabWord, message: string) => void;
  onNeedAuth: () => void;
  onCloseQuizPreview: () => void;
  onCloseViewingRemarks: () => void;
  onCloseViewingMnemonic: () => void;
  onCloseViewingUsage: () => void;
  onClosePreviewRef: () => void;
  onCloseEditingRemarks: () => void;
  onCloseEditingWord: () => void;
};

export function EnVocabPageModals(props: EnVocabPageModalsProps) {
  const nestedModalOpen =
    props.viewingRemarksWord != null ||
    props.previewRef != null ||
    props.editingRemarksWord != null ||
    props.editingWord != null ||
    props.viewingMnemonicWord != null ||
    props.viewingUsageWord != null;

  return (
    <>
      <EnVocabResetChoiceModal
        open={props.showResetChoice}
        busy={props.resetting}
        onClose={props.onResetChoiceClose}
        onResetToday={props.onResetToday}
        onResetAll={props.onResetAll}
      />

      {props.canManualAdd ? (
        <EnVocabManualAddModal
          open={props.showManualAdd}
          locale={props.locale}
          onClose={props.onManualAddClose}
          onAdded={props.onWordAdded}
        />
      ) : null}

      {SHOW_RISK_CHART ? (
        <EnVocabRiskChartModal
          open={props.showRiskChart}
          words={props.words}
          onClose={props.onRiskChartClose}
        />
      ) : null}

      <EnVocabDailyQuizIntroModal
        open={props.showDailyIntro}
        onClose={props.onDailyIntroClose}
      />

      {props.userId != null ? (
        <EnVocabTeacherQuizIntroModal
          userId={props.userId}
          open={props.showTeacherQuizIntro}
          onConfirm={props.onTeacherQuizIntroConfirm}
          onClose={props.onTeacherQuizIntroClose}
        />
      ) : null}

      <EnVocabTeacherQuizFlashcardModal
        open={props.showQuizFlashcard}
        session={props.quizSession}
        wordsById={props.wordsById}
        refs={props.refs}
        locale={props.locale}
        displayOrder={props.displayOrder}
        sessionLevel={props.sessionLevel}
        sessionUsageLevels={props.sessionUsageLevels}
        reviewLockedByWordId={props.reviewLockedByWordId}
        savingWordId={props.savingId}
        dailySeqByWordId={props.dailySeqByWordId}
        dailyQuizProgress={props.displayQuizProgress}
        canOperate={props.canOperate}
        shareUiEnabled={props.teacherShareUiEnabled}
        sharedTodayWordIds={props.sharedTodayWordIds}
        studentPeeked={props.studentPeekedCurrentWord}
        onClose={props.onQuizFlashcardClose}
        onComplete={props.onQuizComplete}
        onSelectLevel={(wordId: number, level: EnVocabLevel) =>
          props.onRecordLevel(wordId, level)
        }
        onSelectUsageLevels={(
          wordId: number,
          levels: Array<EnVocabLevel | null | undefined>
        ) => props.onRecordUsageLevels(wordId, levels)}
        onNavigate={props.onQuizNavigate}
        onOpenRef={props.onOpenRef}
        onViewRemarks={props.onOpenRemarks}
        onEditRemarks={props.onEditRemarks}
        onEditWord={props.onEditWord}
        onShare={props.onShare}
        onWordUpdated={props.onWordSaved}
        nestedModalOpen={nestedModalOpen}
      />

      {props.isAdminMode ? (
        <EnVocabTeacherQuizFlashcardModal
          open={props.quizCardPreviewSession != null}
          session={props.quizCardPreviewSession}
          wordsById={props.wordsById}
          refs={props.refs}
          locale={props.locale}
          displayOrder={props.displayOrder}
          sessionLevel={props.sessionLevel}
          sessionUsageLevels={props.sessionUsageLevels}
          reviewLockedByWordId={props.reviewLockedByWordId}
          savingWordId={null}
          dailySeqByWordId={props.dailySeqByWordId}
          dailyQuizProgress={null}
          canOperate
          shareUiEnabled={false}
          previewMode
          onClose={props.onCloseQuizPreview}
          onComplete={props.onCloseQuizPreview}
          onSelectLevel={() => {
            /* 预览只读 */
          }}
          onSelectUsageLevels={() => {
            /* 预览只读 */
          }}
          onNavigate={() => {
            /* 单条预览 */
          }}
          onOpenRef={props.onOpenRef}
          onViewRemarks={props.onOpenRemarks}
          onEditRemarks={props.onEditRemarks}
          onEditWord={props.onEditWord}
          onWordUpdated={props.onWordSaved}
          nestedModalOpen={nestedModalOpen}
        />
      ) : null}

      <EnVocabRemarksViewModal
        open={props.viewingRemarksWord != null}
        word={props.viewingRemarksWord}
        onClose={props.onCloseViewingRemarks}
      />

      <EnVocabMnemonicViewModal
        open={props.viewingMnemonicWord != null}
        word={props.viewingMnemonicWord}
        onClose={props.onCloseViewingMnemonic}
      />

      <EnVocabUsageViewModal
        open={props.viewingUsageWord != null}
        word={props.viewingUsageWord}
        onClose={props.onCloseViewingUsage}
      />

      <EnVocabRefPreviewModal
        open={props.previewRef != null}
        refMeta={props.previewRef?.ref ?? null}
        cacheVersion={props.previewRef?.cacheVersion}
        onClose={props.onClosePreviewRef}
      />

      <EnClassNotesEditModal
        open={props.editingRemarksWord != null}
        word={props.editingRemarksWord}
        locale={props.locale}
        canEdit={props.canOperate}
        sharedToday={
          props.editingRemarksWord != null &&
          props.sharedTodayWordIds.has(props.editingRemarksWord.id)
        }
        onClose={props.onCloseEditingRemarks}
        onSaved={props.onWordSaved}
        onSaveFailed={props.onWordSaveFailed}
        onNeedAuth={props.onNeedAuth}
      />

      <EnVocabEditModal
        open={props.editingWord != null}
        word={props.editingWord}
        locale={props.locale}
        canEdit={props.canOperate}
        showMnemonic={props.isAdminMode}
        onClose={props.onCloseEditingWord}
        onSaved={props.onWordSaved}
        onSaveFailed={props.onWordSaveFailed}
        onNeedAuth={props.onNeedAuth}
      />
    </>
  );
}
