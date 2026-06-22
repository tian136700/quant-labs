"use client";

import { useMemo, useState } from "react";
import { JpEditIconButton } from "@/components/JpEditIconButton";

const SHORT_MAX_CHARS = 72;
const SHORT_MAX_LINES = 2;

type Props = {
  text: string | null | undefined;
  canEdit?: boolean;
  onEdit?: () => void;
};

function isLongNote(text: string): boolean {
  if (text.length > SHORT_MAX_CHARS) return true;
  return text.split("\n").length > SHORT_MAX_LINES;
}

export function JpClassNotesCell({ text, canEdit, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);

  const trimmed = useMemo(() => (text || "").trim(), [text]);
  const showEdit = Boolean(canEdit && onEdit);

  const content = !trimmed ? (
    <span className="jp-class-notes-empty">—</span>
  ) : isLongNote(trimmed) ? (
    <div className="jp-class-notes-cell">
      <p className={`jp-class-notes-text${expanded ? " is-expanded" : ""}`}>
        {expanded
          ? trimmed
          : trimmed.slice(0, SHORT_MAX_CHARS).replace(/\s+$/, "") + "…"}
      </p>
      <button
        type="button"
        className="jp-class-notes-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "收起" : "展开"}
      </button>
    </div>
  ) : (
    <span className="jp-class-notes-text">{trimmed}</span>
  );

  return (
    <div className="jp-class-notes-row">
      <div className="jp-class-notes-content">{content}</div>
      {showEdit ? (
        <JpEditIconButton title="编辑课堂笔记" onClick={onEdit!} />
      ) : null}

      <style jsx>{`
        .jp-class-notes-row {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          max-width: 100%;
          margin: 0 auto;
        }

        .jp-class-notes-content {
          min-width: 0;
          text-align: center;
        }

        .jp-class-notes-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          max-width: 18rem;
          text-align: center;
        }

        .jp-class-notes-text {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.45;
          font-size: 0.8125rem;
          color: var(--text);
          word-break: break-word;
          text-align: center;
        }

        .jp-class-notes-text.is-expanded {
          max-width: 100%;
        }

        .jp-class-notes-empty {
          color: var(--muted);
        }

        .jp-class-notes-toggle {
          border: none;
          background: transparent;
          color: var(--accent);
          font-size: 0.75rem;
          padding: 0;
          cursor: pointer;
          font: inherit;
        }

        .jp-class-notes-toggle:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
