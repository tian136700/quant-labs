"use client";

export function JpVocabManualAddModalStyles() {
  return (
    <style jsx global>{`

        .jp-vocab-add-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-vocab-add-modal {
          width: min(640px, 100%);
          max-height: min(92vh, 860px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--border) 88%, var(--accent));
          background: linear-gradient(
            165deg,
            color-mix(in srgb, var(--panel) 92%, var(--accent)) 0%,
            var(--panel) 42%,
            color-mix(in srgb, var(--panel) 96%, var(--bg)) 100%
          );
          box-shadow:
            0 28px 64px rgba(0, 0, 0, 0.48),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        }

        .jp-vocab-add-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-vocab-add-heading {
          min-width: 0;
        }

        .jp-vocab-add-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.01em;
        }

        .jp-vocab-add-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-vocab-add-close {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          margin: 0;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          transition:
            color 0.15s ease,
            border-color 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-close:hover:not(:disabled) {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--bg));
        }

        .jp-vocab-add-close:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-add-body {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: 1rem 1.1rem;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        .jp-vocab-add-body::-webkit-scrollbar {
          width: 8px;
        }

        .jp-vocab-add-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .jp-vocab-add-body::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 999px;
        }

        .jp-vocab-add-modal .field {
          min-width: 0;
        }

        .jp-vocab-add-modal .field label,
        .jp-vocab-add-field-label {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.35;
        }

        .jp-vocab-add-modal .field input[type="text"] {
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          min-height: 2.75rem;
          color-scheme: dark;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-modal .field input[type="text"]::placeholder {
          color: color-mix(in srgb, var(--muted) 72%, transparent);
        }

        .jp-vocab-add-modal .field input[type="text"]:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
        }

        .jp-vocab-add-modal .field input[type="text"]:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-vocab-add-modal .field input[type="text"]:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea {
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          font: inherit;
          font-size: 0.875rem;
          line-height: 1.45;
          min-height: 9rem;
          resize: vertical;
          color-scheme: dark;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea::placeholder {
          color: color-mix(in srgb, var(--muted) 72%, transparent);
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-notes-field.is-dragover {
          outline: 1.5px dashed color-mix(in srgb, var(--accent) 65%, var(--border));
          outline-offset: 4px;
          border-radius: 8px;
        }

        .jp-vocab-add-notes-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.65rem;
          margin-bottom: 0.45rem;
        }

        .jp-vocab-add-notes-toolbar-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-add-notes-images {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          margin-top: 0.55rem;
        }

        .jp-vocab-add-notes-image-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }

        .jp-vocab-add-notes-image-preview {
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

        .jp-vocab-add-notes-image-preview img {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 240px;
          margin: 0 auto;
          object-fit: contain;
        }

        .jp-vocab-add-notes-image-hint {
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

        .jp-vocab-add-notes-image-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--rise);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.1rem 0.25rem;
        }

        .jp-vocab-add-notes-image-remove:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-vocab-add-notes-image-remove:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-add-modal .field input[type="text"]:-webkit-autofill,
        .jp-vocab-add-modal .field input[type="text"]:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--text);
          -webkit-box-shadow: 0 0 0 1000px var(--bg) inset;
          box-shadow: 0 0 0 1000px var(--bg) inset;
          transition: background-color 9999s ease-out 0s;
        }

        .jp-vocab-add-segment {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.2rem;
          padding: 0.2rem;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-vocab-add-segment-btn {
          border: none;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0.45rem 1.05rem;
          font-size: 0.8125rem;
          line-height: 1.3;
          cursor: pointer;
          transition:
            color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-vocab-add-segment-btn:hover:not(:disabled):not(.is-active) {
          color: var(--text);
          background: color-mix(in srgb, var(--panel) 70%, var(--bg));
        }

        .jp-vocab-add-segment-btn.is-active {
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
        }

        .jp-vocab-add-segment-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-add-drop {
          border: 1px dashed color-mix(in srgb, var(--border) 88%, var(--accent));
          border-radius: 10px;
          padding: 0.9rem;
          text-align: center;
          background: color-mix(in srgb, var(--bg) 72%, var(--panel));
          outline: none;
          transition:
            border-color 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-drop:focus-visible {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
        }

        .jp-vocab-add-drop.is-dragover {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }

        .jp-vocab-add-drop-hint {
          margin: 0 0 0.65rem;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-vocab-add-preview-thumb {
          position: relative;
          display: block;
          width: 100%;
          margin: 0 0 0.65rem;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
          cursor: zoom-in;
          overflow: hidden;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-vocab-add-preview-thumb:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .jp-vocab-add-preview-thumb:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-preview-thumb img {
          display: block;
          width: 100%;
          max-height: 220px;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 80%, #000);
        }

        .jp-vocab-add-preview-zoom-hint {
          position: absolute;
          right: 0.55rem;
          bottom: 0.55rem;
          padding: 0.2rem 0.45rem;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.62);
          color: #fff;
          font-size: 0.75rem;
          line-height: 1.3;
          pointer-events: none;
        }

        .jp-vocab-add-preview-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }

        .jp-vocab-add-zoom {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .jp-vocab-add-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .jp-vocab-add-zoom-stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 1rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar-track {
          background: transparent;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 999px;
        }

        .jp-vocab-add-zoom-stage img {
          display: block;
          width: auto;
          max-width: min(96vw, 1400px);
          height: auto;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        .jp-vocab-add-hint {
          margin: 0.4rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
          line-height: 1.4;
        }

        .jp-vocab-add-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          line-height: 1.4;
        }

        .jp-vocab-add-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.55rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 38%, var(--panel));
        }

        .jp-vocab-add-footer .btn-rsi-filter {
          min-width: 5.5rem;
        }

        @media (max-width: 480px) {
          .jp-vocab-add-overlay {
            padding: 0.65rem;
            align-items: flex-end;
          }

          .jp-vocab-add-modal {
            max-height: 92vh;
            border-bottom-left-radius: 10px;
            border-bottom-right-radius: 10px;
          }

          .jp-vocab-add-segment {
            display: flex;
            width: 100%;
          }

          .jp-vocab-add-segment-btn {
            flex: 1;
          }

          .jp-vocab-add-footer .btn-rsi-filter {
            flex: 1;
          }
        }
          `}</style>
  );
}
