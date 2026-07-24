"use client";

import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { EnVocabUsageExamplesPairedContent } from "@/components/EnVocabUsageExamplesPairedContent";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { formatEnVocabClassNotesForDisplay } from "@/components/en-vocab-teacher-quiz-flashcard/helpers";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";

export type EnVocabFlashcardPageBodyProps = {
  showSideCol: boolean;
  wordTrim: string;
  readingTrim: string;
  meaningTrim: string;
  posTrim: string;
  w: EnVocabWord;
  vocabRef: EnVocabRef | undefined;
  onOpenRef: (refKey: string, ref: EnVocabRef | undefined) => void;
  canOperate: boolean;
  onEditWord?: (w: EnVocabWord) => void;
  onEditRemarks?: (w: EnVocabWord) => void;
  onViewRemarks: (w: EnVocabWord) => void;
  hasNotes: boolean;
  shareUiEnabled: boolean;
  isStudy: boolean;
  isShared: boolean;
  onUnshare?: (wordId: number) => void;
  isSaving: boolean;
  isSharing: boolean;
  reviewLocked: boolean;
  usagesCompleteForShare: boolean;
  showUncheckedUsagesBlocked: (
    levels: ReadonlyArray<EnVocabLevel | null | undefined>,
    actionHint: string
  ) => void;
  usageDraftLevels: Array<EnVocabLevel | null | undefined>;
  onShare?: (wordId: number) => void;
  showUsageExamples: boolean;
  usageExampleModel: ReturnType<typeof import("@/lib/en-vocab-usage-examples-display").buildEnVocabUsageExamplePairs>;
  usePerUsageLevels: boolean;
  usageLevelDisabled: boolean;
  usageLevelDisabledReason: string | undefined;
  setNextBlockedHint: (v: boolean) => void;
  setNextBlockedUsageMessage: (v: string | null) => void;
  onSelectUsageLevels?: (
    wordId: number,
    levels: Array<EnVocabLevel | null | undefined>
  ) => void;
};

export function EnVocabFlashcardPageBody(props: EnVocabFlashcardPageBodyProps) {
  const {
    showSideCol, wordTrim, readingTrim, meaningTrim, posTrim, w, vocabRef, onOpenRef,
    canOperate, onEditWord, onEditRemarks, onViewRemarks, hasNotes, shareUiEnabled,
    isStudy, isShared, onUnshare, isSaving, isSharing, reviewLocked, usagesCompleteForShare,
    showUncheckedUsagesBlocked, usageDraftLevels, onShare, showUsageExamples,
    usageExampleModel, usePerUsageLevels, usageLevelDisabled, usageLevelDisabledReason,
    setNextBlockedHint, setNextBlockedUsageMessage, onSelectUsageLevels,
  } = props;
  return (
        <div className="jp-vocab-teacher-quiz__scroll-body en-vocab-flashcard-page__body">
          <div
            className={`en-vocab-flashcard-page__grid${
              showSideCol ? "" : " en-vocab-flashcard-page__grid--single"
            }`}
          >
            <div className="en-vocab-flashcard-page__col-main">
              <div
                className="jp-vocab-teacher-quiz__hero"
                id="en-vocab-teacher-quiz-title"
              >
                <div className="jp-vocab-teacher-quiz__reading-row en-vocab-flashcard-reading-row">
                  <div className="en-vocab-flashcard-lemma-group">
                    {wordTrim ? <EnVocabSpeakButton text={wordTrim} /> : null}
                    <span
                      className={`jp-vocab-teacher-quiz__kind-prefix en-vocab-flashcard-kind${
                        w.kind === "grammar"
                          ? " jp-vocab-teacher-quiz__kind-prefix--grammar"
                          : ""
                      }`}
                    >
                      {w.kind === "grammar" ? "语法：" : "单词："}
                    </span>
                    {w.ref_key ? (
                      <button
                        type="button"
                        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma"
                        title={vocabRef?.title ? `教案：${vocabRef.title}` : "查看教案"}
                        onClick={() => onOpenRef(w.ref_key!, vocabRef)}
                      >
                        {wordTrim || "—"}
                      </button>
                    ) : (
                      <span className="jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma">
                        {wordTrim || "—"}
                      </span>
                    )}
                  </div>
                  {readingTrim ? (
                    <span
                      className="jp-vocab-teacher-quiz__kanji en-vocab-flashcard-ipa"
                      title={readingTrim}
                    >
                      {readingTrim}
                    </span>
                  ) : null}
                </div>
                {readingTrim ? (
                  <div className="en-vocab-flashcard-ipa-source">
                    <JpVocabSourceLabel source={w.reading_source} />
                  </div>
                ) : w.kind === "word" ? (
                  <p
                    className="jp-vocab-teacher-quiz__meta-empty"
                    style={{ margin: "0.35rem 0 0", textAlign: "center" }}
                  >
                    音标待补全
                  </p>
                ) : null}
                {w.ref_key ? (
                  <button
                    type="button"
                    className="jp-vocab-teacher-quiz__ref-hint"
                    title={vocabRef?.title ? `教案：${vocabRef.title}` : "查看教案"}
                    onClick={() => onOpenRef(w.ref_key!, vocabRef)}
                  >
                    （点击查看教案）
                  </button>
                ) : null}
              </div>

              <section
                className="jp-vocab-teacher-quiz__info"
                aria-label="词条信息"
              >
                <dl className="jp-vocab-teacher-quiz__meta">
                  <dt>释义：</dt>
                  <dd
                    className={
                      meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"
                    }
                  >
                    {meaningTrim ? (
                      <span className="jp-vocab-teacher-quiz__meaning-wrap">
                        <span>{meaningTrim}</span>
                        <JpVocabSourceLabel source={w.meaning_source} />
                      </span>
                    ) : null}
                  </dd>
                  <dt>词性：</dt>
                  <dd
                    className={posTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}
                  >
                    {posTrim ? (
                      <span className="jp-vocab-teacher-quiz__pos">{posTrim}</span>
                    ) : null}
                  </dd>
                </dl>
                {canOperate ? (
                  <div className="jp-vocab-teacher-quiz__actions-row">
                    <div className="jp-vocab-teacher-quiz__actions-left">
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
                        onClick={() => onEditWord?.(w)}
                      >
                        编辑
                      </button>
                      {w.ref_key ? (
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                          title={vocabRef?.title ? `教案：${vocabRef.title}` : "查看教案"}
                          onClick={() => onOpenRef(w.ref_key!, vocabRef)}
                        >
                          查看教案
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
                        title="编辑备注"
                        onClick={() => onEditRemarks?.(w)}
                      >
                        编辑备注
                      </button>
                    </div>
                    {shareUiEnabled && !isStudy ? (
                      <div
                        className="jp-vocab-teacher-quiz__actions-right"
                        aria-label="共享给学生"
                      >
                        {isShared ? (
                          onUnshare ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn jp-vocab-teacher-quiz__share-btn--unshare"
                              disabled={isSaving || isSharing || reviewLocked}
                              title={
                                reviewLocked
                                  ? "勾选已满 1 小时，无法再操作"
                                  : "从学生「今日英语单词」移除"
                              }
                              onClick={() => onUnshare(w.id)}
                            >
                              取消共享
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn"
                              disabled
                              title="今日已共享到学生「今日英语单词」"
                            >
                              已共享
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className={`btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn${
                              reviewLocked
                                ? " jp-vocab-teacher-quiz__share-btn--locked"
                                : ""
                            }`}
                            disabled={
                              isSaving ||
                              isSharing ||
                              reviewLocked ||
                              !usagesCompleteForShare
                            }
                            title={
                              reviewLocked
                                ? "勾选已满 1 小时，无法再共享"
                                : !usagesCompleteForShare
                                  ? "请先勾完每条用法的熟悉程度，再共享给学生"
                                  : "共享到学生「今日英语单词」"
                            }
                            onClick={() => {
                              if (!usagesCompleteForShare) {
                                showUncheckedUsagesBlocked(
                                  usageDraftLevels,
                                  "再共享给学生"
                                );
                                return;
                              }
                              onShare?.(w.id);
                            }}
                          >
                            共享
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {/* 备注：释义窗格下方空白处；长文可滚 +「查看」弹窗；图可点放大 */}
              {hasNotes || canOperate ? (
                <section
                  className="jp-vocab-teacher-quiz__notes en-vocab-flashcard-page__notes"
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
              ) : null}
            </div>

            {showSideCol ? (
            <div className="en-vocab-flashcard-page__col-side">
              {showUsageExamples ? (
                <section
                  className="jp-vocab-teacher-quiz__examples"
                  aria-label="用法与例句"
                >
                  <div className="jp-vocab-teacher-quiz__examples-head">
                    <h3 className="jp-vocab-teacher-quiz__examples-title">
                      用法与例句
                    </h3>
                  </div>
                  <div className="jp-vocab-teacher-quiz__examples-body">
                    <EnVocabUsageExamplesPairedContent
                      usage={w.usage}
                      exampleSentences={w.example_sentences}
                      usageSource={w.usage_source}
                      exampleSource={w.example_sentences_source}
                      model={usageExampleModel}
                      emptyText="暂无用法与例句"
                      usageLevelControls={
                        usePerUsageLevels
                          ? {
                              levels: usageDraftLevels,
                              disabled: usageLevelDisabled,
                              disabledReason: usageLevelDisabledReason,
                              onSelect: (usageIndex, level) => {
                                if (usageLevelDisabled) return;
                                setNextBlockedHint(false);
                                setNextBlockedUsageMessage(null);
                                const next = usageDraftLevels.map((lv, i) =>
                                  i === usageIndex ? level : lv ?? null
                                );
                                onSelectUsageLevels?.(w.id, next);
                              },
                            }
                          : null
                      }
                    />
                  </div>
                </section>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>


  );
}
