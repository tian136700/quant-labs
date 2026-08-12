"use client";

import type { ReactNode } from "react";
import {
  parseJpVocabParenFurigana,
  sanitizeJpVocabExampleJapaneseLine,
  stripJpVocabParenFurigana,
} from "@/lib/jp-vocab-example-sentences";

type Props = {
  text: string | null | undefined;
  className?: string;
};

/**
 * 助词两侧已有空格时，再包一层加点左右 padding。
 * 半角空格在假名之间（はいくら）肉眼几乎看不见；初学者会当成一个词。
 * 只匹配「空白+助词+空白」，避免拆开「この」「ではない」。
 */
const JP_VOCAB_SPACED_PARTICLE_RE = /(\s)([はがをにでとへもやの])(\s)/g;

function renderTextWithParticleGaps(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(
    JP_VOCAB_SPACED_PARTICLE_RE.source,
    JP_VOCAB_SPACED_PARTICLE_RE.flags
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (match.index > last) {
      nodes.push(value.slice(last, match.index));
    }
    nodes.push(match[1]);
    nodes.push(
      <span key={`${keyPrefix}-p-${i}`} className="jp-vocab-learner-particle">
        {match[2]}
      </span>
    );
    nodes.push(match[3]);
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < value.length) {
    nodes.push(value.slice(last));
  }
  return nodes.length ? nodes : [value];
}

/**
 * 例句日语行展示：存库仍是「漢字(かな)」，这里渲染成汉字正下方小字假名。
 * 编辑框 / 定时任务写回请继续用括号格式，不要改存库。
 *
 * 用 flex 列而不是依赖 `ruby-position: under`（各浏览器默认常在上方）。
 */
export function JpVocabFuriganaText({ text, className }: Props) {
  const raw = sanitizeJpVocabExampleJapaneseLine(text ?? "");
  if (!raw) return null;

  const segments = parseJpVocabParenFurigana(raw);
  const plain = stripJpVocabParenFurigana(raw);

  return (
    <span
      className={["jp-vocab-furigana-text", className].filter(Boolean).join(" ")}
      aria-label={plain}
    >
      {segments.map((seg, index) =>
        seg.type === "text" ? (
          <span key={`t-${index}`}>
            {renderTextWithParticleGaps(seg.value, `t-${index}`)}
          </span>
        ) : (
          <span
            key={`r-${index}`}
            className="jp-vocab-furigana-unit"
            title={seg.reading}
          >
            <span className="jp-vocab-furigana-base">{seg.base}</span>
            <span className="jp-vocab-furigana-reading" aria-hidden="true">
              {seg.reading}
            </span>
          </span>
        )
      )}
      <style jsx global>{`
        .jp-vocab-furigana-text {
          line-height: 1.35;
          /* 半角空格加宽：は いくら / 料金 は 高… 初学者一眼能分开 */
          word-spacing: 0.28em;
        }
        .jp-vocab-learner-particle {
          padding: 0 0.14em;
        }
        .jp-vocab-furigana-unit {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          vertical-align: baseline;
          margin: 0 0.06em;
          line-height: 1.05;
        }
        .jp-vocab-furigana-base {
          line-height: 1.15;
        }
        /* 汉字下方假名：略大 + 亮蓝，方便不识汉字时对照读音 */
        .jp-vocab-furigana-reading {
          display: block;
          font-size: 0.64em;
          font-weight: 650;
          line-height: 1.25;
          letter-spacing: 0.01em;
          white-space: nowrap;
          color: #8ec5ff;
          user-select: none;
          margin-top: 0.08em;
        }
      `}</style>
    </span>
  );
}
