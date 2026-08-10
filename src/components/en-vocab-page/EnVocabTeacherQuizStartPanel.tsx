"use client";

import { beijingDateString } from "@/lib/en-vocab-daily-check";

const ENCOURAGEMENTS = [
  "加油吧，今天也要顺利完成抽查！",
  "今天加油，认真抽问、稳扎稳打！",
  "本轮专心一点，你和学生都会有收获！",
  "加油啊今天，一步一个脚印完成抽查！",
  "今天也辛苦啦，开始抽问，加油！",
] as const;

function pickEncouragement(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ENCOURAGEMENTS[hash % ENCOURAGEMENTS.length] ?? ENCOURAGEMENTS[0];
}

type EnVocabTeacherQuizStartPanelProps = {
  /** 本轮还需抽查的单词数（池内未勾选） */
  remainingCount: number;
  /** 今日抽查目标总数 */
  quizTarget: number;
  loading?: boolean;
  disabled?: boolean;
  onStart: () => void;
};

/**
 * 老师端开场页：未点「开始抽查」前不展示词表，
 * 只显示本轮数量、鼓励语与开始按钮，避免在列表上乱点。
 */
export function EnVocabTeacherQuizStartPanel({
  remainingCount,
  quizTarget,
  loading = false,
  disabled = false,
  onStart,
}: EnVocabTeacherQuizStartPanelProps) {
  const encouragement = pickEncouragement(beijingDateString());
  const count = Math.max(0, remainingCount);
  const canStart = !loading && !disabled && count > 0;

  return (
    <div
      className="en-vocab-teacher-quiz-start-panel"
      role="region"
      aria-label="开始本轮抽查"
    >
      <p className="en-vocab-teacher-quiz-start-panel__encourage">
        {encouragement}
      </p>
      <p className="en-vocab-teacher-quiz-start-panel__count">
        本轮需要抽查{" "}
        <strong className="en-vocab-teacher-quiz-start-panel__count-num">
          {count}
        </strong>{" "}
        个单词
        {quizTarget > 0 && count !== quizTarget ? (
          <span className="en-vocab-teacher-quiz-start-panel__count-hint">
            （今日目标 {quizTarget} 个）
          </span>
        ) : null}
      </p>
      <p className="en-vocab-teacher-quiz-start-panel__hint">
        请点下方按钮开始抽查。开始后才会同步当前单词，学生才能「查看老师正在抽查的单词」。
      </p>
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--primary en-vocab-teacher-quiz-start-panel__btn"
        disabled={!canStart}
        onClick={onStart}
      >
        {loading ? "加载中…" : "开始抽查"}
      </button>
      {!count && !loading ? (
        <p className="en-vocab-teacher-quiz-start-panel__empty">
          当前没有待抽查的单词，请等管理员设置今日抽查数量后再试。
        </p>
      ) : null}
      <style jsx>{`
        .en-vocab-teacher-quiz-start-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin: 0.25rem 0 0.85rem;
          padding: 1.35rem 1.1rem 1.2rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--accent, #4c8bf5) 28%, var(--border));
          background: color-mix(
            in srgb,
            var(--accent, #4c8bf5) 7%,
            var(--panel)
          );
        }
        .en-vocab-teacher-quiz-start-panel__encourage {
          margin: 0 0 0.75rem;
          max-width: 28rem;
          font-size: 1.05rem;
          font-weight: 600;
          line-height: 1.45;
          color: var(--text);
        }
        .en-vocab-teacher-quiz-start-panel__count {
          margin: 0 0 0.55rem;
          font-size: 1rem;
          line-height: 1.5;
          color: var(--text);
        }
        .en-vocab-teacher-quiz-start-panel__count-num {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--accent, #4c8bf5);
        }
        .en-vocab-teacher-quiz-start-panel__count-hint {
          display: inline-block;
          margin-left: 0.15rem;
          font-size: 0.85rem;
          font-weight: 400;
          color: var(--muted);
        }
        .en-vocab-teacher-quiz-start-panel__hint {
          margin: 0 0 1.05rem;
          max-width: 28rem;
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--muted);
        }
        .en-vocab-teacher-quiz-start-panel__btn {
          width: min(22rem, 100%);
          min-height: 2.75rem;
          font-size: 1rem;
        }
        .en-vocab-teacher-quiz-start-panel__empty {
          margin: 0.85rem 0 0;
          max-width: 28rem;
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--muted);
        }
        @media (max-width: 767px) {
          .en-vocab-teacher-quiz-start-panel {
            padding: 1.15rem 0.85rem 1rem;
          }
          .en-vocab-teacher-quiz-start-panel__encourage {
            font-size: 1rem;
          }
          .en-vocab-teacher-quiz-start-panel__btn {
            font-size: clamp(0.875rem, 3.6vw, 1rem);
            line-height: 1.35;
          }
        }
      `}</style>
    </div>
  );
}
