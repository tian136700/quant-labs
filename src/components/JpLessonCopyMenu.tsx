"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
      left: "auto",
      zIndex: 10000,
    });
  }, []);

  const toggleOpen = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setOpen((prev) => {
        const next = !prev;
        if (next && fixedPanel) updatePanelStyle();
        return next;
      });
    },
    [fixedPanel, updatePanelStyle]
  );

  useEffect(() => {
    if (!open) return;
    if (fixedPanel) updatePanelStyle();

    const onDoc = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollOrResize = () => {
      if (fixedPanel) updatePanelStyle();
      else setOpen(false);
    };

    // Defer so the opening tap does not immediately close the menu (mobile).
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
    }, 0);

    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, fixedPanel, updatePanelStyle]);

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

  const pickCopyMode = (mode: CopyMode) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void copyLessonLink(mode);
  };

  const label = copiedId === lessonId ? "已复制" : "复制";

  const panel = (
    <div
      ref={panelRef}
      className={`jp-lesson-copy-panel${fixedPanel ? " is-fixed is-portal" : ""}`}
      style={fixedPanel ? panelStyle : undefined}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="jp-lesson-copy-item"
        onPointerDown={pickCopyMode("withText")}
      >
        <span className="jp-lesson-copy-item-title">带文字</span>
        <span className="jp-lesson-copy-item-desc">附带发给老师的说明</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="jp-lesson-copy-item"
        onPointerDown={pickCopyMode("linkOnly")}
      >
        <span className="jp-lesson-copy-item-title">仅链接</span>
        <span className="jp-lesson-copy-item-desc">只复制教案查看地址</span>
      </button>
    </div>
  );

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
      {open
        ? fixedPanel && mounted
          ? createPortal(panel, document.body)
          : panel
        : null}
      <style jsx global>
        {copyMenuStyles}
      </style>
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
    z-index: 10000;
  }
  .jp-lesson-copy-panel.is-portal {
    touch-action: manipulation;
    pointer-events: auto;
  }
  .jp-lesson-copy-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.65rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
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
