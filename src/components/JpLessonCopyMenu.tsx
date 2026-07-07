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

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const panelHeight = 132;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelHeight + gap;
    setPanelStyle({
      position: "fixed",
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap, top: "auto" }
        : { top: rect.bottom + gap, bottom: "auto" }),
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
      if (wrapRef.current?.contains(e.target as Node)) return;
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
      ) : null}
    </div>
  );
}
