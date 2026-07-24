"use client";

export function VocabRefEditModalStyles() {
  return (
    <style jsx global>{`

        .jp-ref-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-ref-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(520px, 100%);
          max-height: min(88vh, 680px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-ref-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-ref-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-ref-edit-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-ref-edit-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-ref-edit-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem 1.1rem;
        }

        .jp-ref-edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .jp-ref-edit-label-text {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-current-block {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .jp-ref-edit-current-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .jp-ref-edit-current-card {
          position: relative;
          display: block;
          width: 100%;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
          cursor: pointer;
          overflow: hidden;
          text-align: left;
        }

        .jp-ref-edit-current-card:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .jp-ref-edit-current-card:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-ref-edit-current-img {
          display: block;
          width: 100%;
          max-height: 11rem;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }

        .jp-ref-edit-current-overlay {
          display: block;
          padding: 0.45rem 0.65rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--panel) 92%, transparent);
        }

        .jp-ref-edit-current-card--pdf {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 7rem;
          padding: 1rem;
        }

        .jp-ref-edit-current-pdf-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 3rem;
          padding: 0.35rem 0.55rem;
          border-radius: 6px;
          background: color-mix(in srgb, var(--rise) 14%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          font-weight: 700;
        }

        .jp-ref-edit-current-card-title {
          font-size: 0.875rem;
          color: var(--text);
        }

        .jp-ref-edit-current-card-hint {
          font-size: 0.75rem;
          color: var(--accent);
        }

        .jp-ref-edit-current-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 5.5rem;
          border: 1px dashed var(--border);
          border-radius: 10px;
          color: var(--muted);
          font-size: 0.8125rem;
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
        }

        .jp-ref-edit-muted {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-view-link {
          color: var(--accent);
          text-decoration: none;
        }

        .jp-ref-edit-view-link:hover {
          text-decoration: underline;
        }

        .jp-ref-edit-drop {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 9.5rem;
          padding: 1rem;
          border: 1.5px dashed color-mix(in srgb, var(--border) 90%, var(--accent));
          border-radius: 10px;
          background:
            radial-gradient(
              circle at top,
              color-mix(in srgb, var(--accent) 8%, transparent),
              transparent 55%
            ),
            color-mix(in srgb, var(--bg) 70%, var(--panel));
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-ref-edit-drop.is-dragover,
        .jp-ref-edit-drop:focus-visible {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
        }

        .jp-ref-edit-drop.has-file {
          align-items: stretch;
          min-height: 0;
        }

        .jp-ref-edit-drop.is-disabled {
          opacity: 0.72;
          pointer-events: none;
        }

        .jp-ref-edit-drop-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          border-radius: 999px;
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .jp-ref-edit-drop-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text);
        }

        .jp-ref-edit-drop-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-pick-btn {
          margin-top: 0.25rem;
          min-height: 2.25rem;
          padding: 0.35rem 1rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }

        .jp-ref-edit-pick-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 22%, var(--panel));
        }

        .jp-ref-edit-picked {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .jp-ref-edit-preview-btn {
          position: relative;
          flex-shrink: 0;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
        }

        .jp-ref-edit-preview-btn:disabled {
          cursor: not-allowed;
        }

        .jp-ref-edit-preview {
          display: block;
          width: 4.5rem;
          height: 4.5rem;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-ref-edit-preview-hint {
          position: absolute;
          inset: auto 0 0 0;
          padding: 0.15rem 0.25rem;
          font-size: 0.625rem;
          line-height: 1.2;
          text-align: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
        }

        .jp-ref-edit-preview-btn:hover .jp-ref-edit-preview {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-ref-edit-pdf-btn {
          cursor: pointer;
          font: inherit;
        }

        .jp-ref-edit-pdf-btn:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-ref-edit-preview-link {
          align-self: flex-start;
          margin-top: 0.15rem;
          padding: 0;
          border: none;
          background: none;
          color: var(--accent);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .jp-ref-edit-pdf-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 4.5rem;
          height: 4.5rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          color: var(--rise);
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .jp-ref-edit-picked-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .jp-ref-edit-picked-name {
          font-size: 0.875rem;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .jp-ref-edit-picked-size {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-ref-edit-remove {
          flex-shrink: 0;
          min-height: 2rem;
          padding: 0.25rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }

        .jp-ref-edit-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .jp-ref-edit-progress-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-progress-track {
          position: relative;
          height: 0.45rem;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--border) 70%, transparent);
        }

        .jp-ref-edit-progress-track.is-processing .jp-ref-edit-progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          width: 35% !important;
          animation: jp-ref-upload-indeterminate 1.1s ease-in-out infinite;
        }

        @keyframes jp-ref-upload-indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        .jp-ref-edit-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, white),
            var(--accent)
          );
          transition: width 0.08s linear;
        }

        .jp-ref-edit-zoom {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-ref-edit-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }

        .jp-ref-edit-zoom-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          overflow: auto;
        }

        .jp-ref-edit-zoom-stage :global(img) {
          max-width: min(96vw, 1200px);
          max-height: calc(100vh - 4rem);
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        .jp-ref-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-ref-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }
          `}</style>
  );
}
