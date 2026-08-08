"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  useVocabRefImageZoom,
  VocabRefImageZoomButtons,
  VocabRefImageZoomStage,
} from "@/components/VocabRefImageZoom";

type Props = {
  open: boolean;
  imageUrl: string | null;
  onClose: () => void;
  /** 兼容旧 class，便于回归检测 */
  rootClassName?: string;
};

/**
 * 粘贴教案图放大预览：± / 重置 / 捏合 / Ctrl·⌘+滚轮缩放；普通滚轮平移。
 */
export function JpLessonAiPlanImageZoomOverlay({
  open,
  imageUrl,
  onClose,
  rootClassName = "jp-lesson-ai-plan-image-zoom",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const url = (imageUrl || "").trim();
  const zoomApi = useVocabRefImageZoom(open && url ? url : undefined);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open || !url) return null;

  return createPortal(
    <div
      className={rootClassName}
      role="dialog"
      aria-modal="true"
      aria-label="教案大图预览"
      onClick={onClose}
    >
      <div
        className="jp-lesson-ai-plan-image-zoom-bar"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="jp-lesson-ai-plan-image-zoom-title">
          教案图 · ± 可再缩放 · 空白处 / Esc 关闭
        </span>
        <VocabRefImageZoomButtons
          api={zoomApi}
          className="jp-lesson-ai-plan-image-zoom-tools"
          buttonClassName="jp-lesson-ai-plan-image-zoom-tool-btn"
        />
        <button
          type="button"
          className="jp-lesson-ai-plan-image-zoom-close"
          onClick={onClose}
          aria-label="关闭大图预览"
        >
          ×
        </button>
      </div>
      <div
        className="jp-lesson-ai-plan-image-zoom-body"
        onClick={(e) => e.stopPropagation()}
      >
        <VocabRefImageZoomStage
          api={zoomApi}
          mediaUrl={url}
          title="教案大图预览"
          stageClassName="jp-lesson-ai-plan-image-zoom-stage"
          canvasClassName="jp-lesson-ai-plan-image-zoom-canvas"
          imageClassName="jp-lesson-ai-plan-image-zoom-img"
        />
      </div>
      <style jsx global>{`
        .jp-lesson-ai-plan-image-zoom,
        .jp-lesson-content-edit-ai-plan-zoom,
        .jp-lesson-ai-plan-zoom {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.82);
          padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
            env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
        }
        .jp-lesson-ai-plan-image-zoom-bar {
          flex-shrink: 0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.55rem 0.75rem;
          padding: 0.65rem 0.85rem;
          color: #f3f5f8;
          font-size: 0.88rem;
        }
        .jp-lesson-ai-plan-image-zoom-title {
          flex: 1 1 auto;
          min-width: 8rem;
        }
        .jp-lesson-ai-plan-image-zoom-tools {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .jp-lesson-ai-plan-image-zoom-tool-btn,
        .jp-lesson-ai-plan-image-zoom-close {
          min-width: 2.2rem;
          height: 2.2rem;
          padding: 0 0.55rem;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 1.05rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-lesson-ai-plan-image-zoom-tool-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .jp-lesson-ai-plan-image-zoom-close {
          font-size: 1.35rem;
        }
        .jp-lesson-ai-plan-image-zoom-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .jp-lesson-ai-plan-image-zoom-stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          touch-action: none;
          cursor: grab;
          -webkit-overflow-scrolling: touch;
        }
        .jp-lesson-ai-plan-image-zoom-stage:active {
          cursor: grabbing;
        }
        .jp-lesson-ai-plan-image-zoom-canvas {
          margin: 0 auto;
          min-width: 100%;
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 0.75rem;
        }
        .jp-lesson-ai-plan-image-zoom-img {
          display: block;
          max-width: none;
          max-height: none;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
          pointer-events: none;
        }
        @media (max-width: 767px) {
          .jp-lesson-ai-plan-image-zoom-bar {
            padding: 0.55rem 0.7rem;
          }
          .jp-lesson-ai-plan-image-zoom-tool-btn,
          .jp-lesson-ai-plan-image-zoom-close {
            min-width: 2.4rem;
            height: 2.4rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
