"use client";

export function LessonAnnotateModalStyles() {
  return (
    <style jsx global>{`
      .jp-annotate {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        flex-direction: column;
        background: rgba(8, 12, 18, 0.92);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }

      .jp-annotate-bar {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.65rem 0.85rem;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      }

      .jp-annotate-bar-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .jp-annotate-title {
        font-size: 0.9375rem;
        color: var(--text);
        font-weight: 600;
      }

      .jp-annotate-subtitle {
        font-size: 0.75rem;
        color: var(--muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .jp-annotate-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.35rem;
        max-width: min(100%, 42rem);
      }

      .jp-annotate-tool {
        min-height: 2rem;
        padding: 0.25rem 0.55rem;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
      }

      .jp-annotate-tool:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        background: color-mix(in srgb, var(--accent) 8%, var(--panel));
      }

      .jp-annotate-tool.is-active {
        color: var(--rise);
        border-color: color-mix(in srgb, var(--rise) 55%, var(--border));
        background: color-mix(in srgb, var(--rise) 12%, var(--panel));
      }

      .jp-annotate-tool:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .jp-annotate-tool--accent {
        color: var(--accent);
      }

      .jp-annotate-tool--save {
        color: var(--fall);
        border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
        background: color-mix(in srgb, var(--fall) 10%, var(--panel));
      }

      .jp-annotate-tool--save:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--fall) 65%, var(--border));
        background: color-mix(in srgb, var(--fall) 16%, var(--panel));
      }

      .jp-annotate-save-status {
        align-self: center;
        font-size: 0.75rem;
        color: var(--fall);
        white-space: nowrap;
      }

      .jp-annotate-tool-sep {
        width: 1px;
        height: 1.25rem;
        background: color-mix(in srgb, var(--border) 80%, transparent);
        margin-inline: 0.1rem;
      }

      .jp-annotate-text-size {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.1rem 0.35rem;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--rise) 8%, var(--panel));
      }

      .jp-annotate-text-size-label {
        font-size: 0.75rem;
        color: var(--muted);
        white-space: nowrap;
      }

      .jp-annotate-text-size-btn {
        min-width: 1.75rem;
        padding-inline: 0.35rem;
      }

      .jp-annotate-text-size-value {
        min-width: 1.5rem;
        font-size: 0.75rem;
        color: var(--text);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .jp-annotate-text-size-range {
        width: 4.5rem;
        accent-color: var(--rise);
        cursor: pointer;
      }

      .jp-annotate-close {
        flex-shrink: 0;
        width: 2rem;
        height: 2rem;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--muted);
        font-size: 1.25rem;
        line-height: 1;
        cursor: pointer;
      }

      .jp-annotate-close:hover {
        color: var(--text);
        border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
      }

      .jp-annotate-hint {
        margin: 0;
        padding: 0.45rem 0.85rem;
        font-size: 0.75rem;
        color: var(--muted);
        border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
      }

      .jp-annotate-stage {
        flex: 1;
        min-height: 0;
        padding: 0.65rem 1.25rem;
        overflow: auto;
        position: relative;
      }

      .jp-annotate-stage-inner {
        min-width: 100%;
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .jp-annotate-loading {
        position: absolute;
        z-index: 1;
        margin: 0;
        color: var(--muted);
        font-size: 0.875rem;
      }

      .jp-annotate-canvas-wrap {
        position: relative;
        display: block;
        flex-shrink: 0;
        opacity: 0;
        pointer-events: none;
      }

      .jp-annotate-canvas-wrap.is-ready {
        opacity: 1;
        pointer-events: auto;
      }

      .jp-annotate-img,
      .jp-annotate-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      .jp-annotate-canvas {
        position: absolute;
        inset: 0;
        cursor: crosshair;
        touch-action: none;
      }

      .jp-annotate-canvas-wrap.is-zoom-tool .jp-annotate-canvas {
        cursor: zoom-in;
      }

      .jp-annotate-canvas-wrap.is-zoom-tool.is-zoomed .jp-annotate-canvas {
        cursor: grab;
      }

      .jp-annotate-canvas-wrap.is-zoom-tool.is-zoomed .jp-annotate-canvas:active {
        cursor: grabbing;
      }

      .jp-annotate-canvas-wrap.is-text-tool .jp-annotate-canvas {
        cursor: text;
      }

      .jp-annotate-canvas-wrap.is-smear-tool .jp-annotate-canvas {
        cursor: crosshair;
      }

      .jp-annotate-canvas-wrap.is-text-selected .jp-annotate-canvas {
        cursor: move;
      }

      .jp-annotate-text-pop {
        position: fixed;
        z-index: 1210;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 12rem;
        max-width: min(90vw, 20rem);
        padding: 0.45rem;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--panel);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }

      .jp-annotate-text-pop-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 1.5rem;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        border: 1px dashed color-mix(in srgb, var(--border) 85%, var(--muted));
        background: color-mix(in srgb, var(--muted) 8%, var(--panel));
        color: var(--muted);
        font-size: 0.6875rem;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .jp-annotate-text-pop-handle:active {
        cursor: grabbing;
      }

      .jp-annotate-text-input {
        width: 100%;
        min-height: 2rem;
        padding: 0.35rem 0.5rem;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
        font: inherit;
        font-size: 0.875rem;
      }

      .jp-annotate-text-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.35rem;
      }

      .jp-annotate-text-btn {
        min-height: 1.75rem;
        padding: 0.15rem 0.55rem;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--accent);
        font: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
      }

      @media (max-width: 768px) {
        .jp-annotate-stage {
          padding: 0.5rem 0.75rem;
        }

        .jp-annotate-bar {
          flex-wrap: wrap;
        }

        .jp-annotate-tools {
          width: 100%;
          justify-content: flex-start;
        }

        .jp-annotate-tool {
          min-height: var(--touch-min, 44px);
        }

        .jp-annotate-close {
          width: var(--touch-min, 44px);
          height: var(--touch-min, 44px);
        }
      }
    `}</style>
  );
}
