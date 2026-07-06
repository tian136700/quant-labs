"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type CopyMode = "withText" | "linkOnly";

type Props = {
  lessonId: number;
  viewUrl: string;
  siteUrl: string;
  primaryClassName?: string;
  fixedPanel?: boolean;
  copiedId: number | null;
  onCopied: (lessonId: number) => void;
  onCopyError: () => void;
  icon?: ReactNode;
};

const COPY_WITH_TEXT =
  "老师，这是咱们需要上课内容，麻烦你有时间的时候抽空看一下：";

export function JpLessonCopyMenu({
  lessonId,
  viewUrl,
  siteUrl,
  primaryClassName = "jp-lesson-action-btn",
  fixedPanel = false,
  copiedId,
  onCopied,
  onCopyError,
  icon,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && fixedPanel && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setPanelStyle({
          position: "fixed",
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
          left: "auto",
        });
      }
      return next;
    });
  }, [fixedPanel]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copyLessonLink = async (mode: CopyMode) => {
    try {
      const link = `${siteUrl}${viewUrl}`;
      const text = mode === "withText" ? `${COPY_WITH_TEXT}${link}` : link;
      await navigator.clipboard.writeText(text);
      onCopied(lessonId);
      setOpen(false);
    } catch {
      onCopyError();
    }
  };

  const label = copiedId === lessonId ? "已复制" : "复制";

  return (
    <div className={`jp-lesson-copy-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-lesson-copy-trigger`}
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        {label}
        <span className="jp-lesson-copy-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className={`jp-lesson-copy-panel${fixedPanel ? " is-fixed" : ""}`}
          style={fixedPanel ? panelStyle : undefined}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="jp-lesson-copy-item"
            onClick={() => void copyLessonLink("withText")}
          >
            <span className="jp-lesson-copy-item-title">带文字</span>
            <span className="jp-lesson-copy-item-desc">附带发给老师的说明</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-lesson-copy-item"
            onClick={() => void copyLessonLink("linkOnly")}
          >
            <span className="jp-lesson-copy-item-title">仅链接</span>
            <span className="jp-lesson-copy-item-desc">只复制教案查看地址</span>
          </button>
        </div>
      ) : null}
      <style jsx>{copyMenuStyles}</style>
    </div>
  );
}

const copyMenuStyles = `
  .jp-lesson-copy-menu {
    position: relative;
    flex-shrink: 0;
  }
  .jp-lesson-copy-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .jp-lesson-copy-caret {
    font-size: 0.75rem;
    opacity: 0.85;
  }
  .jp-lesson-copy-panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    min-width: 10.5rem;
    padding: 0.35rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    z-index: 30;
  }
  .jp-lesson-copy-panel.is-fixed {
    z-index: 1000;
  }
  .jp-lesson-copy-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .jp-lesson-copy-item:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .jp-lesson-copy-item-title {
    font-size: 0.875rem;
    font-weight: 600;
  }
  .jp-lesson-copy-item-desc {
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.35;
  }
`;
