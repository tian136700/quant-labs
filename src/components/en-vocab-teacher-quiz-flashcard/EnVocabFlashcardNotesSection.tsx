"use client";

import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { formatEnVocabClassNotesForDisplay } from "@/components/en-vocab-teacher-quiz-flashcard/helpers";
import type { EnVocabWord } from "@/lib/types";

export type EnVocabFlashcardNotesSectionProps = {
  /** desktop = 释义下；mobile = 抽查优先级块底（仅窄屏显示） */
  placement: "desktop" | "mobile";
  w: EnVocabWord;
  hasNotes: boolean;
  canOperate: boolean;
  onViewRemarks: (w: EnVocabWord) => void;
  onEditRemarks?: (w: EnVocabWord) => void;
};

/**
 * 英语抽问卡备注区。桌面在释义窗格下；手机挪到统计「抽查优先级」块最下方。
 * 两处各渲染一份，用 CSS 按断点互斥显示，避免跨列重排。
 */
export function EnVocabFlashcardNotesSection(
  props: EnVocabFlashcardNotesSectionProps
) {
  const { placement, w, hasNotes, canOperate, onViewRemarks, onEditRemarks } =
    props;
  if (!hasNotes && !canOperate) return null;

  const placementClass =
    placement === "desktop"
      ? "en-vocab-flashcard-page__notes--desktop"
      : "en-vocab-flashcard-page__notes--mobile en-vocab-flashcard-page-footer__notes";

  return (
    <section
      className={`jp-vocab-teacher-quiz__notes en-vocab-flashcard-page__notes ${placementClass}`}
      aria-label="备注"
    >
      <div className="jp-vocab-teacher-quiz__notes-head">
        <h3 className="jp-vocab-teacher-quiz__notes-title">备注</h3>
        <div className="jp-vocab-teacher-quiz__notes-actions">
          {hasNotes ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
              title="弹窗查看全部备注"
              onClick={() => onViewRemarks(w)}
            >
              查看全部
            </button>
          ) : null}
          {canOperate ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
              title="编辑备注"
              onClick={() => onEditRemarks?.(w)}
            >
              编辑备注
            </button>
          ) : null}
        </div>
      </div>
      {hasNotes ? (
        <div className="jp-vocab-teacher-quiz__notes-body en-vocab-flashcard-page__notes-body">
          <EnVocabClassNoteContent
            content={formatEnVocabClassNotesForDisplay(w.class_notes)}
          />
        </div>
      ) : (
        <p className="jp-vocab-teacher-quiz__notes-preview jp-vocab-teacher-quiz__meta-empty">
          暂无备注
        </p>
      )}
    </section>
  );
}
