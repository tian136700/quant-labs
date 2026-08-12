"use client";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";

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

export type JpVocabTeacherQuizPendingWord = {
  id: number;
  word: string;
};

type JpVocabTeacherQuizStartPanelProps = {
  /** 本轮还需抽查的词条数（池内未勾选） */
  remainingCount: number;
  /** 本轮待抽词条（只读预览；与 remainingCount 一致） */
  pendingWords?: JpVocabTeacherQuizPendingWord[];
  loading?: boolean;
  disabled?: boolean;
  onStart: () => void;
};

/**
 * 老师端开场页：左只读待抽列表 + 右开始抽查。
 * 仍不展示可点词表，避免未开始乱点。对齐英语 StartPanel。
 * 只显示本轮剩余数，禁止附带「今日目标 N 个」。
 */
export function JpVocabTeacherQuizStartPanel({
  remainingCount,
  pendingWords = [],
  loading = false,
  disabled = false,
  onStart,
}: JpVocabTeacherQuizStartPanelProps) {
  const encouragement = pickEncouragement(beijingDateString());
  const count = Math.max(0, remainingCount);
  const canStart = !loading && !disabled && count > 0;

  return (
    <div
      className="jp-vocab-teacher-quiz-start-panel"
      role="region"
      aria-label="开始本轮抽查"
    >
      <aside
        className="jp-vocab-teacher-quiz-start-panel__list"
        aria-label="本轮待抽词条"
      >
        <h3 className="jp-vocab-teacher-quiz-start-panel__list-title">
          本轮待抽
          {count > 0 ? (
            <span className="jp-vocab-teacher-quiz-start-panel__list-count">
              （{count}）
            </span>
          ) : null}
        </h3>
        {pendingWords.length > 0 ? (
          <ol className="jp-vocab-teacher-quiz-start-panel__list-ol">
            {pendingWords.map((item, index) => (
              <li
                key={item.id}
                className="jp-vocab-teacher-quiz-start-panel__list-item"
              >
                <span className="jp-vocab-teacher-quiz-start-panel__list-idx">
                  {index + 1}.
                </span>
                <span className="jp-vocab-teacher-quiz-start-panel__list-word">
                  {item.word}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="jp-vocab-teacher-quiz-start-panel__list-empty">
            暂无待抽词条
          </p>
        )}
      </aside>

      <div className="jp-vocab-teacher-quiz-start-panel__main">
        <p className="jp-vocab-teacher-quiz-start-panel__encourage">
          {encouragement}
        </p>
        <p className="jp-vocab-teacher-quiz-start-panel__count">
          本轮需要抽查{" "}
          <strong className="jp-vocab-teacher-quiz-start-panel__count-num">
            {count}
          </strong>{" "}
          个词条
        </p>
        <p className="jp-vocab-teacher-quiz-start-panel__hint">
          请点下方按钮开始抽查。开始后才会同步当前词条，学生才能「查看老师正在抽查的单词」。
        </p>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-start-panel__btn"
          disabled={!canStart}
          onClick={onStart}
        >
          {loading ? "加载中…" : "开始抽查"}
        </button>
        {!count && !loading ? (
          <p className="jp-vocab-teacher-quiz-start-panel__empty">
            当前没有待抽查的词条，请等管理员设置今日抽查数量后再试。
          </p>
        ) : null}
      </div>

      <style jsx>{`
        .jp-vocab-teacher-quiz-start-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
          gap: 0.85rem 1rem;
          align-items: stretch;
          margin: 0.25rem 0 0.85rem;
          padding: 1rem 1rem 1.05rem;
          border-radius: 10px;
          border: 1px solid
            color-mix(in srgb, var(--accent, #4c8bf5) 28%, var(--border));
          background: color-mix(
            in srgb,
            var(--accent, #4c8bf5) 7%,
            var(--panel)
          );
        }
        .jp-vocab-teacher-quiz-start-panel__list {
          min-width: 0;
          display: flex;
          flex-direction: column;
          max-height: min(22rem, 55vh);
          padding: 0.65rem 0.7rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 88%, transparent);
        }
        .jp-vocab-teacher-quiz-start-panel__list-title {
          margin: 0 0 0.45rem;
          font-size: 0.9rem;
          font-weight: 650;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz-start-panel__list-count {
          margin-left: 0.15rem;
          font-weight: 500;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz-start-panel__list-ol {
          margin: 0;
          padding: 0;
          list-style: none;
          overflow-y: auto;
          overflow-x: clip;
          -webkit-overflow-scrolling: touch;
          flex: 1 1 auto;
        }
        .jp-vocab-teacher-quiz-start-panel__list-item {
          display: flex;
          align-items: baseline;
          gap: 0.35rem;
          padding: 0.28rem 0.15rem;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 70%, transparent);
          font-size: 0.95rem;
          line-height: 1.4;
          color: var(--text);
          pointer-events: none;
          user-select: text;
        }
        .jp-vocab-teacher-quiz-start-panel__list-item:last-child {
          border-bottom: none;
        }
        .jp-vocab-teacher-quiz-start-panel__list-idx {
          flex: 0 0 auto;
          min-width: 1.5rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          font-size: 0.85rem;
        }
        .jp-vocab-teacher-quiz-start-panel__list-word {
          min-width: 0;
          word-break: break-word;
        }
        .jp-vocab-teacher-quiz-start-panel__list-empty {
          margin: 0.35rem 0 0;
          font-size: 0.85rem;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz-start-panel__main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0.35rem 0.25rem;
        }
        .jp-vocab-teacher-quiz-start-panel__encourage {
          margin: 0 0 0.75rem;
          max-width: 28rem;
          font-size: 1.05rem;
          font-weight: 600;
          line-height: 1.45;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz-start-panel__count {
          margin: 0 0 0.55rem;
          font-size: 1rem;
          line-height: 1.5;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz-start-panel__count-num {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--accent, #4c8bf5);
        }
        .jp-vocab-teacher-quiz-start-panel__hint {
          margin: 0 0 1.05rem;
          max-width: 28rem;
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz-start-panel__btn {
          width: min(22rem, 100%);
          min-height: 2.75rem;
          font-size: 1rem;
        }
        .jp-vocab-teacher-quiz-start-panel__empty {
          margin: 0.85rem 0 0;
          max-width: 28rem;
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--muted);
        }
        @media (max-width: 767px) {
          .jp-vocab-teacher-quiz-start-panel {
            grid-template-columns: 1fr;
            padding: 0.9rem 0.75rem 0.95rem;
          }
          .jp-vocab-teacher-quiz-start-panel__list {
            max-height: min(14rem, 40vh);
            order: 0;
          }
          .jp-vocab-teacher-quiz-start-panel__main {
            order: 1;
          }
          .jp-vocab-teacher-quiz-start-panel__encourage {
            font-size: 1rem;
          }
          .jp-vocab-teacher-quiz-start-panel__btn {
            font-size: clamp(0.875rem, 3.6vw, 1rem);
            line-height: 1.35;
          }
        }
      `}</style>
    </div>
  );
}
