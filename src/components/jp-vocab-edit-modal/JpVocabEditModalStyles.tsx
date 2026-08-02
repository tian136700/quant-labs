"use client";

/** Extracted from JpVocabEditModal. */
export function JpVocabEditModalStyles() {
  return (
    <style jsx global>{`
        .jp-vocab-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-vocab-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(560px, 100%);
          max-height: min(94vh, 860px);
          min-height: 0;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        @media (min-width: 768px) {
          .jp-vocab-edit-modal {
            width: min(780px, 94vw);
            max-height: min(94vh, 960px);
          }
        }

        .jp-vocab-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-vocab-edit-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          line-height: 1.45;
          color: var(--muted);
        }

        .jp-vocab-edit-close {
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

        .jp-vocab-edit-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-width: auto;
          scrollbar-color: color-mix(in srgb, var(--accent) 75%, #8899aa)
            color-mix(in srgb, var(--bg) 70%, var(--panel));
        }

        .jp-vocab-edit-body::-webkit-scrollbar {
          width: 11px;
        }

        .jp-vocab-edit-body::-webkit-scrollbar-track {
          margin: 0.35rem 0;
          background: color-mix(in srgb, var(--bg) 65%, var(--panel));
          border-radius: 999px;
        }

        .jp-vocab-edit-body::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--accent) 70%, #8a9bb0);
          border-radius: 999px;
          border: 2px solid color-mix(in srgb, var(--bg) 65%, var(--panel));
        }

        .jp-vocab-edit-body::-webkit-scrollbar-thumb:hover {
          background: var(--accent);
        }

        .jp-vocab-edit-body.is-scrollable {
          box-shadow: inset 0 -10px 12px -12px rgba(0, 0, 0, 0.35);
        }

        .jp-vocab-edit-scroll-hint {
          margin: 0;
          padding: 0.4rem 0.55rem;
          border-radius: 6px;
          border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          color: color-mix(in srgb, var(--accent) 55%, var(--text));
          font-size: 0.75rem;
          line-height: 1.4;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .jp-vocab-edit-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-input,
        .jp-vocab-edit-select,
        .jp-vocab-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.55rem 0.65rem;
          line-height: 1.45;
        }

        .jp-vocab-edit-select {
          cursor: pointer;
        }

        .jp-vocab-edit-select:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-edit-input:disabled,
        .jp-vocab-edit-textarea:disabled {
          opacity: 0.72;
          cursor: not-allowed;
          color: color-mix(in srgb, var(--text) 75%, var(--muted));
        }

        .jp-vocab-edit-textarea:not(:disabled) {
          cursor: text;
          caret-color: var(--accent);
        }

        .jp-vocab-edit-textarea:not(:disabled):focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        .jp-vocab-edit-textarea {
          resize: vertical;
        }

        .jp-vocab-edit-textarea--sm {
          min-height: 3.2rem;
        }

        .jp-vocab-edit-textarea--lg {
          min-height: 5.5rem;
        }

        /* 例句 / 备注：整段展开，不在小框里二次滚动 */
        .jp-vocab-edit-textarea--expand {
          min-height: 5rem;
          overflow-y: hidden;
          resize: none;
          field-sizing: content;
        }

        .jp-vocab-edit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-source-footer {
          display: block;
          width: 100%;
          margin-top: 0.15rem;
        }

        .jp-vocab-edit-notes-field {
          gap: 0.45rem;
        }

        .jp-vocab-edit-notes-field.is-dragover {
          outline: 1.5px dashed color-mix(in srgb, var(--accent) 65%, var(--border));
          outline-offset: 4px;
          border-radius: 8px;
        }

        .jp-vocab-edit-notes-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.65rem;
        }

        .jp-vocab-edit-notes-toolbar-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-notes-images {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .jp-vocab-edit-notes-image-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }

        .jp-vocab-edit-notes-image-preview {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.35rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          cursor: zoom-in;
          overflow: hidden;
        }

        .jp-vocab-edit-notes-image-preview :global(img) {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 240px;
          margin: 0 auto;
          object-fit: contain;
        }

        .jp-vocab-edit-notes-image-hint {
          position: absolute;
          right: 0.45rem;
          bottom: 0.4rem;
          padding: 0.12rem 0.4rem;
          border-radius: 4px;
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.92);
          background: rgba(0, 0, 0, 0.52);
          pointer-events: none;
        }

        .jp-vocab-edit-notes-image-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--rise);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.1rem 0.25rem;
        }

        .jp-vocab-edit-notes-image-remove:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-vocab-edit-notes-image-remove:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-edit-ref-field {
          gap: 0.5rem;
        }

        .jp-vocab-edit-ref-head,
        .jp-vocab-edit-ref-title-row,
        .jp-vocab-edit-ref-progress-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .jp-vocab-edit-ref-key,
        .jp-vocab-edit-ref-mini-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .jp-vocab-edit-ref-col {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-width: 0;
        }

        .jp-vocab-edit-ref-title {
          font-size: 0.8125rem;
          color: var(--text);
          font-weight: 600;
        }

        .jp-vocab-edit-ref-link,
        .jp-vocab-edit-ref-link-btn {
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

        .jp-vocab-edit-ref-link {
          text-decoration: none;
        }

        .jp-vocab-edit-ref-link:hover {
          text-decoration: underline;
        }

        .jp-vocab-edit-ref-card,
        .jp-vocab-edit-ref-empty {
          width: 100%;
          min-height: 10.5rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
        }

        .jp-vocab-edit-ref-card {
          padding: 0;
          overflow: hidden;
          cursor: pointer;
        }

        .jp-vocab-edit-ref-card--pdf {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 1rem;
        }

        .jp-vocab-edit-ref-current-img {
          display: block;
          width: 100%;
          max-height: 9rem;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }

        .jp-vocab-edit-ref-card-title {
          color: var(--text);
          font-size: 0.875rem;
        }

        .jp-vocab-edit-ref-card-hint {
          display: block;
          padding: 0.45rem 0.65rem;
          text-align: center;
          font-size: 0.75rem;
          color: var(--muted);
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--panel) 92%, transparent);
        }

        .jp-vocab-edit-ref-pdf-badge,
        .jp-vocab-edit-ref-pdf-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 3rem;
          height: 3rem;
          padding: 0.35rem 0.55rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          font-weight: 700;
        }

        .jp-vocab-edit-ref-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          border-style: dashed;
          color: var(--muted);
          font-size: 0.8125rem;
        }

        .jp-vocab-edit-ref-drop {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 10.5rem;
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

        .jp-vocab-edit-ref-drop.is-dragover {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
        }

        .jp-vocab-edit-ref-drop.has-file {
          align-items: stretch;
          justify-content: flex-start;
        }

        .jp-vocab-edit-ref-drop.is-disabled {
          opacity: 0.72;
          pointer-events: none;
        }

        .jp-vocab-edit-ref-drop-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text);
          text-align: center;
        }

        .jp-vocab-edit-ref-drop-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
          text-align: center;
        }

        .jp-vocab-edit-ref-pick-btn,
        .jp-vocab-edit-ref-remove {
          min-height: 2.2rem;
          padding: 0.35rem 0.9rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-vocab-edit-ref-remove {
          min-height: 2rem;
          padding: 0.25rem 0.65rem;
          border-color: var(--border);
          background: var(--panel);
          color: var(--muted);
        }

        .jp-vocab-edit-ref-picked {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .jp-vocab-edit-ref-preview-btn {
          position: relative;
          flex-shrink: 0;
          padding: 0;
          border: none;
          border-radius: 8px;
          background: none;
          cursor: pointer;
          overflow: hidden;
        }

        .jp-vocab-edit-ref-preview {
          display: block;
          width: 4.75rem;
          height: 4.75rem;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-vocab-edit-ref-preview-hint {
          position: absolute;
          inset: auto 0 0 0;
          padding: 0.15rem 0.25rem;
          font-size: 0.625rem;
          line-height: 1.2;
          text-align: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
        }

        .jp-vocab-edit-ref-picked-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .jp-vocab-edit-ref-picked-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text);
          font-size: 0.875rem;
        }

        .jp-vocab-edit-ref-picked-size {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .jp-vocab-edit-ref-progress-head {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-progress-track {
          position: relative;
          height: 0.45rem;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--border) 70%, transparent);
        }

        .jp-vocab-edit-ref-progress-track.is-processing .jp-vocab-edit-ref-progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          width: 35% !important;
          animation: jp-vocab-edit-ref-upload-indeterminate 1.1s ease-in-out infinite;
        }

        @keyframes jp-vocab-edit-ref-upload-indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        .jp-vocab-edit-ref-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, white),
            var(--accent)
          );
          transition: width 0.08s linear;
        }

        .jp-vocab-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-vocab-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-zoom {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-vocab-edit-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }

        .jp-vocab-edit-zoom-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          overflow: auto;
        }

        .jp-vocab-edit-zoom-stage :global(img) {
          max-width: min(96vw, 1200px);
          max-height: calc(100vh - 4rem);
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        @media (max-width: 720px) {
          .jp-vocab-edit-ref-grid {
            grid-template-columns: 1fr;
          }

          .jp-vocab-edit-ref-picked {
            align-items: flex-start;
          }
        }
      `}</style>
  );
}
