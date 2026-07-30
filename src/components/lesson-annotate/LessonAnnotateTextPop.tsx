"use client";

import type { RefObject, PointerEvent as ReactPointerEvent } from "react";

export type LessonAnnotateTextDraft = {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  value: string;
};

type Props = {
  draft: LessonAnnotateTextDraft;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onHandlePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandlePointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onHandlePointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

export function LessonAnnotateTextPop({
  draft,
  inputRef,
  onChange,
  onConfirm,
  onCancel,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
}: Props) {
  return (
    <div
      className="jp-annotate-text-pop"
      style={{ left: draft.screenX, top: draft.screenY }}
    >
      <div
        className="jp-annotate-text-pop-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        拖动
      </div>
      <input
        ref={inputRef}
        type="text"
        className="jp-annotate-text-input"
        value={draft.value}
        placeholder="输入文字，Enter 确认"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="jp-annotate-text-actions">
        <button type="button" className="jp-annotate-text-btn" onClick={onConfirm}>
          确定
        </button>
        <button type="button" className="jp-annotate-text-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
