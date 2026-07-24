"use client";

import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  LEVELS,
  LEVEL_LABEL,
} from "@/components/en-vocab-teacher-quiz-flashcard/helpers";
import { enVocabTotalReviewsZeroHint } from "@/lib/en-vocab-shared";
import type { EnVocabLevel, EnVocabWord } from "@/lib/types";

type Props = {
  canOperate: boolean;
  w: EnVocabWord;
  isStudy: boolean;
  previewMode: boolean;
  usePerUsageLevels: boolean;
  selected: EnVocabLevel | undefined;
  overallFromUsages: EnVocabLevel | null;
  reviewLocked: boolean;
  isSaving: boolean;
  levelSyncHintShort: string;
  levelSyncHint: string;
  saveBusy: boolean;
  saveProgressLabel: string;
  saveProgressPercent: number;
  locale: "zh" | "en";
  priorityLabel: string;
  riskBadgeTier: string;
  totalDisplay: { label: string; isZero: boolean };
  risk: number;
  todayChecks: number;
  onSelectLevel: (wordId: number, level: EnVocabLevel) => void;
  setNextBlockedHint: (v: boolean) => void;
};

export function EnVocabFlashcardPageFooter(props: Props) {
  const {
    canOperate, w, isStudy, previewMode, usePerUsageLevels,
    selected, overallFromUsages, reviewLocked, isSaving, levelSyncHintShort, levelSyncHint,
    saveBusy, saveProgressLabel, saveProgressPercent, locale, priorityLabel, riskBadgeTier,
    totalDisplay, risk, todayChecks, onSelectLevel, setNextBlockedHint,
  } = props;
  return (
        <div className="en-vocab-flashcard-page-footer">
        <div className="en-vocab-flashcard-page-footer__panels">
        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            {isStudy
              ? "老师勾选"
              : previewMode
                ? usePerUsageLevels
                  ? "预览模式：用法旁熟悉程度仅为展示，不会保存"
                  : "预览模式：熟悉程度勾选仅为展示，不会保存"
                : usePerUsageLevels
                  ? "请在每条用法旁勾选熟悉程度（全部勾完后才写入并同步给学生）"
                  : "请根据学生熟悉程度，勾选以下选项"}
          </p>
          <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
            <div className="jp-vocab-teacher-quiz__level-main">
              {usePerUsageLevels ? (
                <p
                  className="en-vocab-flashcard-overall-level"
                  aria-live="polite"
                >
                  总体：
                  {selected
                    ? LEVEL_LABEL[selected]
                    : overallFromUsages
                      ? LEVEL_LABEL[overallFromUsages]
                      : "（请勾完每条用法）"}
                </p>
              ) : (
                <div
                  className="jp-vocab-levels"
                  role="group"
                  aria-label="学生熟悉程度"
                >
                  {LEVELS.map((lv) => {
                    const checked = selected === lv.key;
                    const levelDisabled =
                      previewMode || isStudy || reviewLocked || isSaving || !canOperate;
                    return (
                      <button
                        key={lv.key}
                        type="button"
                        className={`jp-vocab-level-opt${
                          checked ? " is-checked" : ""
                        }${
                          reviewLocked || previewMode || isStudy
                            ? " jp-vocab-level-opt--locked"
                            : ""
                        }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                          lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                        }`}
                        disabled={levelDisabled}
                        aria-pressed={checked}
                        title={
                          isStudy
                            ? "老师已勾选的熟悉程度"
                            : previewMode
                              ? "预览模式，勾选不会保存"
                              : reviewLocked
                                ? "勾选已满 1 小时，无法再修改熟悉程度"
                                : !canOperate
                                  ? "请登录后再勾选熟悉程度"
                                  : checked
                                    ? "今日已选此项，可点其他选项改选"
                                    : "勾选学生熟悉程度"
                        }
                        onClick={() => {
                          if (levelDisabled) return;
                          setNextBlockedHint(false);
                          onSelectLevel(w.id, lv.key);
                        }}
                      >
                        <span className="jp-vocab-check-box" aria-hidden="true">
                          {checked ? (
                            <svg viewBox="0 0 12 12" width="10" height="10">
                              <path
                                d="M2 6l3 3 5-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span>{lv.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {!isStudy ? (
              <>
                <span
                  className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--desktop"
                  role="note"
                >
                  {levelSyncHintShort}
                </span>
                <span
                  className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--mobile"
                  role="note"
                >
                  {levelSyncHint}
                </span>
              </>
            ) : null}
          </div>
          {saveBusy ? (
            <JpVocabSaveProgressBar
              label={saveProgressLabel}
              percent={saveProgressPercent}
              fullWidth
              className="jp-vocab-teacher-quiz__level-progress"
            />
          ) : null}
        </div>

        <div className="jp-vocab-teacher-quiz__stats">
          <div className="jp-vocab-teacher-quiz__stat jp-vocab-teacher-quiz__stat--weight">
            <span className="jp-vocab-teacher-quiz__stat-label">
              {locale === "zh" ? (
                <>
                  {priorityLabel}
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    （数值越大，越应该被抽查）
                  </span>
                </>
              ) : (
                <>
                  {priorityLabel}
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    {" "}
                    (higher = more likely to quiz)
                  </span>
                </>
              )}
            </span>
            <span
              className={`jp-vocab-teacher-quiz__risk jp-vocab-teacher-quiz__risk--${riskBadgeTier}`}
              title={
                totalDisplay.isZero
                  ? enVocabTotalReviewsZeroHint(locale)
                  : undefined
              }
            >
              {risk.toFixed(1)}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">今日抽查</span>
            <span
              className={
                todayChecks > 0
                  ? "jp-vocab-teacher-quiz__stat-value jp-vocab-teacher-quiz__stat-value--active"
                  : "jp-vocab-teacher-quiz__stat-value"
              }
            >
              {todayChecks}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">复习合计</span>
            <span
              className="jp-vocab-teacher-quiz__stat-value"
              title={
                totalDisplay.isZero
                  ? enVocabTotalReviewsZeroHint(locale)
                  : undefined
              }
            >
              {totalDisplay.label}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat-grid">
            <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
            <span>一般 {w.cnt_normal}</span>
            <span className="chg-up">不熟悉 {w.cnt_weak}</span>
          </div>
        </div>
        </div>
        </div>

  );
}
