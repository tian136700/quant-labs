"use client";

export function JpLessonNotesPageStyles() {
  return (
    <style jsx global>{`

        .jp-lesson-notes-page-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.35rem;
        }

        .jp-lesson-notes-back {
          margin: 0;
          font-size: 0.8125rem;
        }

        .jp-lesson-notes-back :global(a) {
          color: var(--accent);
          text-decoration: none;
        }

        .jp-lesson-notes-back :global(a:hover) {
          text-decoration: underline;
        }

        .jp-lesson-notes-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-user {
          flex-shrink: 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-panel {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0;
          overflow: hidden;
        }

        .jp-lesson-notes-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem 1.1rem;
        }

        .jp-lesson-notes-section {
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .jp-lesson-notes-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.55rem;
        }

        .jp-lesson-notes-item-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--accent);
        }

        .jp-lesson-notes-section-add {
          flex-shrink: 0;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 6px;
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          color: var(--accent);
          font-size: 0.75rem;
          padding: 0.2rem 0.45rem;
          cursor: pointer;
          font: inherit;
        }

        .jp-lesson-notes-section-add:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
        }

        .jp-lesson-notes-section-add:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-notes-fields {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .jp-lesson-notes-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .jp-lesson-notes-field-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.65rem;
        }

        .jp-lesson-notes-field-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-notes-image-input {
          display: none;
        }

        .jp-lesson-notes-draft-images {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .jp-lesson-notes-draft-image-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }

        .jp-lesson-notes-draft-image-item :global(img) {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 240px;
          margin: 0 auto;
          object-fit: contain;
        }

        .jp-lesson-notes-draft-image-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--rise);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.1rem 0.25rem;
        }

        .jp-lesson-notes-draft-image-remove:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-lesson-notes-draft-image-remove:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-notes-readonly {
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 50%, var(--panel));
        }

        .jp-lesson-notes-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-lesson-notes-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
          resize: vertical;
          min-height: 4rem;
          line-height: 1.45;
        }

        .jp-lesson-notes-textarea:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .jp-lesson-notes-field-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0;
        }

        .jp-lesson-notes-field-remove:hover:not(:disabled) {
          color: var(--rise);
        }

        .jp-lesson-notes-section-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.65rem;
          padding-top: 0.55rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
        }

        .jp-lesson-notes-section-footer-status {
          flex: 1;
          min-width: 0;
        }

        .jp-lesson-notes-sync-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-notes-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-lesson-notes-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-lesson-notes-footer-status {
          flex: 1;
          min-width: 0;
        }

        .jp-lesson-notes-status {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-status--saved {
          color: var(--fall);
        }

        .jp-lesson-notes-status--error {
          color: var(--rise);
        }

        .jp-lesson-notes-footer-actions {
          display: flex;
          gap: 0.5rem;
        }
          `}</style>
  );
}
