"use client";

import { useState } from "react";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import {
  formatJpVocabClassNotesForDisplay,
  hasJpVocabClassNotes,
} from "@/lib/jp-vocab-class-notes";
import { fetchJpVocabClassNotesWord } from "@/lib/jp-vocab-fetch-class-notes";
import { jpVocabTeacherQuizNotesInline } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  word: JpVocabWord;
  locale: "zh" | "en";
  notesLoading: boolean;
  canOperate: boolean;
  /** 学生抽查卡：展示「拉取实时备注」（按需 GET，不轮询） */
  showPullLiveRemarks: boolean;
  onViewRemarks: (word: JpVocabWord) => void;
  onEditRemarks?: (word: JpVocabWord) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  /** 拉取成功后打开只读弹窗展示最新备注（勿走 canOperate 编辑入口） */
  onShowPulledRemarks: (word: JpVocabWord) => void;
};

export function JpVocabFlashcardNotesSection({
  word: w,
  locale,
  notesLoading,
  canOperate,
  showPullLiveRemarks,
  onViewRemarks,
  onEditRemarks,
  onWordUpdated,
  onShowPulledRemarks,
}: Props) {
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState("");

  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");

  if (!hasNotes && !canOperate && !showPullLiveRemarks) return null;

  const handlePullLiveRemarks = async () => {
    if (pulling) return;
    setPulling(true);
    setPullError("");
    const result = await fetchJpVocabClassNotesWord(w, locale);
    setPulling(false);
    if (!result.ok) {
      setPullError(locale === "zh" ? "拉取失败，请重试" : "Failed to load notes");
      return;
    }
    onWordUpdated?.(result.word);
    onShowPulledRemarks(result.word);
  };

  return (
    <section className="jp-vocab-teacher-quiz__notes">
      <div className="jp-vocab-teacher-quiz__notes-head">
        <h3 className="jp-vocab-teacher-quiz__notes-title">备注</h3>
        <div className="jp-vocab-teacher-quiz__notes-actions">
          {hasNotes && !notesLoading ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
              onClick={() => onViewRemarks(w)}
            >
              查看
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
          {showPullLiveRemarks ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
              title="从服务器拉取该词最新备注（仅本次，不后台同步）"
              disabled={pulling || notesLoading}
              onClick={() => void handlePullLiveRemarks()}
            >
              {pulling ? "拉取中…" : "拉取实时备注"}
            </button>
          ) : null}
        </div>
      </div>
      {notesLoading || pulling ? (
        <p className="jp-vocab-teacher-quiz__notes-preview" aria-live="polite">
          {pulling ? "正在拉取实时备注…" : "正在拉取备注…"}
        </p>
      ) : hasNotes ? (
        notesInline ? (
          <div className="jp-vocab-teacher-quiz__notes-body">
            <JpVocabClassNoteContent
              content={formatJpVocabClassNotesForDisplay(w.class_notes)}
            />
          </div>
        ) : (
          <p className="jp-vocab-teacher-quiz__notes-preview">备注较长，请点「查看」</p>
        )
      ) : (
        <p className="jp-vocab-teacher-quiz__notes-preview jp-vocab-teacher-quiz__meta-empty">
          暂无备注
        </p>
      )}
      {pullError ? (
        <p className="jp-vocab-teacher-quiz__notes-preview" role="alert">
          {pullError}
        </p>
      ) : null}
    </section>
  );
}
