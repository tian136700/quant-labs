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

type CopyMode = "withText" | "linkOnly" | "textOnly";

type Props = {
  lessonId: number;
  viewUrl: string;
  siteUrl: string;
  /** 上课老师姓名（多个用顿号连接）；为空时仅文字模板里留两个空格便于手填 */
  teacherNames?: string;
  /** 已复制次数（带模板 / 仅链接 / 仅文字均计入） */
  copyCount?: number;
  primaryClassName?: string;
  fixedPanel?: boolean;
  copiedId: number | null;
  onCopied: (lessonId: number) => void;
  onCopyError: () => void;
  icon?: ReactNode;
};

const COPY_WITH_TEXT =
  "老师，这是咱们需要上课内容，麻烦你有时间的时候抽空看一下：";

/** 姓名后补「老师」（已带则不重复）；多名用顿号拆开分别加 */
function formatTeacherNamesWithHonorific(teacherNames?: string): string {
  const raw = (teacherNames || "").trim();
  if (!raw) return "  老师";
  return raw
    .split("、")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.endsWith("老师") ? part : `${part}老师`))
    .join("、");
}

/** 仅文字：给助教说明，PDF 等教材另行单独发送 */
export function buildEnLessonTextOnlyCopy(teacherNames?: string): string {
  const name = formatTeacherNamesWithHonorific(teacherNames);
  return `助教老师你好，麻烦你有空的时候把这个教材发给${name}，谢谢～`;
}

export function EnLessonCopyMenu({
  lessonId,
  viewUrl,
  siteUrl,
  teacherNames = "",
  copyCount = 0,
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
    const panelHeight = 190;
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

  const copyLesson = async (mode: CopyMode) => {
    try {
      const link = `${siteUrl}${viewUrl}`;
      let text: string;
      if (mode === "withText") {
        text = `${COPY_WITH_TEXT}${link}`;
      } else if (mode === "linkOnly") {
        text = link;
      } else {
        text = buildEnLessonTextOnlyCopy(teacherNames);
      }
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
    void copyLesson(mode);
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
        {copyCount > 0 ? (
          <span className="jp-lesson-copy-count" aria-label={`已复制 ${copyCount} 次`}>
            {copyCount}
          </span>
        ) : null}
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
            <span className="jp-lesson-copy-item-title">带模板</span>
            <span className="jp-lesson-copy-item-desc">说明文字 + 教案链接</span>
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
          <button
            type="button"
            role="menuitem"
            className="jp-lesson-copy-item"
            onPointerDown={pickCopyMode("textOnly")}
          >
            <span className="jp-lesson-copy-item-title">仅文字</span>
            <span className="jp-lesson-copy-item-desc">发给助教（含上课老师，无链接）</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
