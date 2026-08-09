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
import { fixedDropdownPanelStyle } from "@/lib/fixed-dropdown-panel";

type CopyMode = "withText" | "linkOnly";

type BatchCopyItem = {
  lessonId: number;
  content: string;
  viewUrl: string;
};

type Props = {
  batchKey: string;
  items: BatchCopyItem[];
  siteUrl: string;
  primaryClassName?: string;
  fixedPanel?: boolean;
  copiedBatchKey: string | null;
  onCopied: (batchKey: string) => void;
  onCopyError: () => void;
  icon?: ReactNode;
};

export function JpLessonBatchCopyMenu({
  batchKey,
  items,
  siteUrl,
  primaryClassName = "jp-lesson-action-btn",
  fixedPanel = false,
  copiedBatchKey,
  onCopied,
  onCopyError,
  icon,
}: Props) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    setPanelStyle(
      fixedDropdownPanelStyle(wrapRef.current.getBoundingClientRect(), 132, {
        zIndex: 10000,
      })
    );
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

  const copyBatch = async (mode: CopyMode) => {
    try {
      const links = items.map((item) => `${siteUrl}${item.viewUrl}`);
      const text =
        mode === "withText"
          ? [
              `老师，这是需要上课的内容，一共有${items.length}条数据。能上完就上完，上不完的话就留到下一节课上。`,
              ...items.map(
                (item, index) =>
                  `${index + 1}. #${item.lessonId} ${item.content}\n${siteUrl}${item.viewUrl}`
              ),
            ].join("\n\n")
          : links.join("\n");
      await navigator.clipboard.writeText(text);
      onCopied(batchKey);
      setOpen(false);
    } catch {
      onCopyError();
    }
  };

  const pickCopyMode = (mode: CopyMode) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void copyBatch(mode);
  };

  const label = copiedBatchKey === batchKey ? "批量已复制" : "批量复制";

  return (
    <div className={`jp-lesson-copy-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-lesson-copy-trigger`}
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!items.length}
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
