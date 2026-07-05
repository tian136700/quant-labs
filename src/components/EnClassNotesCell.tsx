"use client";

import { useMemo, useState } from "react";
import { EnEditIconButton } from "@/components/EnEditIconButton";

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

function previewNote(text: string, expanded: boolean): string {
  if (expanded) return text;
  const lines = text.split("\n");
  if (lines.length > SHORT_MAX_LINES) {
    return `${lines.slice(0, SHORT_MAX_LINES).join("\n")}…`;
  }
  if (text.length > SHORT_MAX_CHARS) {
    return `${text.slice(0, SHORT_MAX_CHARS).replace(/\s+$/, "")}…`;
  }
  return text;
}

export function EnClassNotesCell({ text, canEdit, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);

  const trimmed = useMemo(() => (text || "").trim(), [text]);
  const showEdit = Boolean(canEdit && onEdit);

  const content = !trimmed ? null : isLongNote(trimmed) ? (
    <div className="jp-class-notes-cell">
      <p className={`jp-class-notes-text${expanded ? " is-expanded" : ""}`}>
        {previewNote(trimmed, expanded)}
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
    <p className="jp-class-notes-text">{trimmed}</p>
  );

  return (
    <div className="jp-class-notes-row">
      <div className="jp-class-notes-content">{content}</div>
      {showEdit ? (
        <EnEditIconButton title="编辑备注" onClick={onEdit!} />
      ) : null}

      <style jsx>{`
        .jp-class-notes-row {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 0.35rem;
          width: 100%;
          max-width: 100%;
        }

        .jp-class-notes-content {
          flex: 1;
          min-width: 0;
          text-align: left;
        }

        .jp-class-notes-cell {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          width: 100%;
          max-width: 100%;
          text-align: left;
        }

        .jp-class-notes-text {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.45;
          font-size: 0.8125rem;
          color: var(--text);
          word-break: break-word;
          text-align: left;
        }

        .jp-class-notes-text.is-expanded {
          max-width: 100%;
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
