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
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import type { JpLessonCoursePair } from "@/lib/jp-lesson-course-pair";
import type { JpVocabRefCropKind } from "@/lib/jp-vocab-ref-pdf-export";

type CopyMode = "withText" | "linkOnly";
type MenuStep = "choose" | "single";

export type JpLessonCourseMergeBusy = {
  courseGroupId: string;
  percent: number;
  label: string;
} | null;

type Props = {
  lessonId: number;
  viewUrl: string;
  siteUrl: string;
  copyCount?: number;
  primaryClassName?: string;
  fixedPanel?: boolean;
  copiedId: number | null;
  onCopied: (lessonId: number) => void;
  onCopyError: () => void;
  icon?: ReactNode;
  /** 有教案图时可复制分页 PDF */
  pdfMediaUrl?: string | null;
  pdfFilename?: string | null;
  pdfCropKind?: JpVocabRefCropKind | null;
  /**
   * 同一课配对时：先问「仅本行」还是「合并整课」。
   * 单词行文案「仅复制单词」；语法行「仅复制语法」。
   */
  coursePair?: JpLessonCoursePair | null;
  /** 当前行是单词侧还是语法侧（决定「仅复制…」文案） */
  courseSide?: "word" | "grammar" | null;
  mergeBusy?: JpLessonCourseMergeBusy;
  onCopyCourseMerge?: (pair: JpLessonCoursePair) => void;
};

const COPY_WITH_TEXT =
  "老师，这是咱们需要上课内容，麻烦你有时间的时候抽空看一下：";

export function JpLessonCopyMenu({
  lessonId,
  viewUrl,
  siteUrl,
  copyCount = 0,
  primaryClassName = "jp-lesson-action-btn",
  fixedPanel = false,
  copiedId,
  onCopied,
  onCopyError,
  icon,
  pdfMediaUrl = null,
  pdfFilename = null,
  pdfCropKind = null,
  coursePair = null,
  courseSide = null,
  mergeBusy = null,
  onCopyCourseMerge,
}: Props) {
  const hasCourseMerge = Boolean(coursePair && onCopyCourseMerge);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<MenuStep>("choose");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const canCopyPdf = Boolean(pdfMediaUrl && pdfFilename);
  const busyForThis =
    coursePair && mergeBusy?.courseGroupId === coursePair.courseGroupId
      ? mergeBusy
      : null;
  const mergeBusyActive = Boolean(busyForThis);

  const panelHeight = (() => {
    if (hasCourseMerge && step === "choose") return 168;
    if (canCopyPdf) return 198;
    return 132;
  })();

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
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
  }, [panelHeight]);

  const toggleOpen = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (pdfBusy || mergeBusyActive) return;
      setOpen((prev) => {
        const next = !prev;
        if (next) {
          setStep(hasCourseMerge ? "choose" : "single");
          if (fixedPanel) updatePanelStyle();
        }
        return next;
      });
    },
    [fixedPanel, hasCourseMerge, mergeBusyActive, pdfBusy, updatePanelStyle]
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

  useEffect(() => {
    if (fixedPanel && open) updatePanelStyle();
  }, [fixedPanel, open, step, updatePanelStyle]);

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

  const copyPaginatedPdf = async (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pdfMediaUrl || !pdfFilename || pdfBusy) return;
    setPdfBusy(true);
    setOpen(false);
    try {
      const { copyJpVocabRefPaginatedPdf } = await import("@/lib/jp-vocab-ref-pdf-export");
      const result = await copyJpVocabRefPaginatedPdf(
        pdfMediaUrl,
        pdfFilename,
        pdfCropKind
      );
      if (result === "copied") {
        onCopied(lessonId);
        window.alert("分页 PDF 已复制，可直接粘贴发送");
      } else if (result === "downloaded") {
        window.alert(
          "当前浏览器无法把 PDF 直接放进剪贴板，已改为下载。下载完成后可在「下载」文件夹里复制发送。"
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      onCopyError();
      window.alert(
        err instanceof Error ? err.message : "复制分页 PDF 失败，请稍后重试"
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const pickSingleOnly = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setStep("single");
  };

  const pickCourseMerge = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!coursePair || !onCopyCourseMerge || mergeBusyActive) return;
    setOpen(false);
    onCopyCourseMerge(coursePair);
  };

  const onlyLabel =
    courseSide === "grammar" ? "仅复制语法" : "仅复制单词";
  const onlyDesc =
    courseSide === "grammar"
      ? "只要这一行的语法教案"
      : "只要这一行的单词教案";

  const label = mergeBusyActive
    ? "合并中…"
    : pdfBusy
      ? "复制 PDF…"
      : copiedId === lessonId
        ? "已复制"
        : "复制";

  const singleItems = (
    <>
      {hasCourseMerge && step === "single" ? (
        <button
          type="button"
          role="menuitem"
          className="jp-lesson-copy-item"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setStep("choose");
          }}
        >
          <span className="jp-lesson-copy-item-title">← 返回</span>
          <span className="jp-lesson-copy-item-desc">重新选择仅本行或合并</span>
        </button>
      ) : null}
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
      {canCopyPdf ? (
        <button
          type="button"
          role="menuitem"
          className="jp-lesson-copy-item"
          onPointerDown={(e) => void copyPaginatedPdf(e)}
        >
          <span className="jp-lesson-copy-item-title">分页 PDF</span>
          <span className="jp-lesson-copy-item-desc">
            一步复制文件；不支持则分享或下载
          </span>
        </button>
      ) : null}
    </>
  );

  return (
    <div className={`jp-lesson-copy-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-lesson-copy-trigger`}
        onClick={toggleOpen}
        disabled={pdfBusy || mergeBusyActive}
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
      {busyForThis ? (
        <JpVocabSaveProgressBar
          label={busyForThis.label}
          percent={busyForThis.percent}
          fullWidth
          className="jp-lesson-copy-merge-progress"
        />
      ) : null}
      {open ? (
        <div
          className={`jp-lesson-copy-panel${fixedPanel ? " is-fixed" : ""}`}
          style={fixedPanel ? panelStyle : undefined}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {hasCourseMerge && step === "choose" ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="jp-lesson-copy-item"
                onPointerDown={pickSingleOnly}
              >
                <span className="jp-lesson-copy-item-title">{onlyLabel}</span>
                <span className="jp-lesson-copy-item-desc">{onlyDesc}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="jp-lesson-copy-item"
                onPointerDown={pickCourseMerge}
              >
                <span className="jp-lesson-copy-item-title">复制合并整课</span>
                <span className="jp-lesson-copy-item-desc">
                  单词+语法合并成一份查看链接
                </span>
              </button>
            </>
          ) : (
            singleItems
          )}
        </div>
      ) : null}
    </div>
  );
}
