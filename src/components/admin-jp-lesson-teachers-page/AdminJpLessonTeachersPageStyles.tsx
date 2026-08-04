"use client";

/** Extracted from AdminJpLessonTeachersPage.tsx. */
export function AdminJpLessonTeachersPageStyles() {
  return (
    <style jsx global>{`

        .admin-jpl-teacher-user-link {
          color: var(--accent, #6eb5ff);
          font-weight: 600;
          text-decoration: none;
        }

        .admin-jpl-teacher-user-link:hover {
          text-decoration: underline;
        }

        .admin-jpl-search-combo {
          position: relative;
          flex: 1 1 15rem;
          min-width: min(100%, 15rem);
        }

        .admin-jpl-search-field {
          display: block;
          width: 100%;
        }

        .admin-jpl-search-field input {
          width: 100%;
          box-sizing: border-box;
          min-height: 2.25rem;
          padding-block: 0.45rem;
        }

        .admin-jpl-search-suggest {
          position: absolute;
          z-index: 20;
          top: calc(100% + 0.25rem);
          left: 0;
          right: 0;
          margin: 0;
          padding: 0.3rem;
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          max-height: 14rem;
          overflow: auto;
        }

        .admin-jpl-search-suggest-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          text-align: left;
          padding: 0.5rem 0.55rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .admin-jpl-search-suggest-item:hover {
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }

        .admin-jpl-search-suggest-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .admin-jpl-search-suggest-meta {
          flex-shrink: 0;
          font-size: 0.75rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }

        .jp-lesson-teacher-overlay {
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

        .jp-lesson-teacher-modal {
          width: min(560px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-teacher-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-teacher-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-teacher-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-teacher-close {
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

        .admin-jpl-add-form {
          display: grid;
          gap: 0.85rem;
        }

        :global(.admin-jpl-tencent-meeting) {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.5rem;
        }

        :global(.admin-jpl-tencent-tag) {
          display: inline-block;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          color: var(--accent);
          font-size: 0.6875rem;
          font-weight: 600;
          line-height: 1.3;
        }

        :global(.admin-jpl-tencent-id) {
          font-size: 0.8125rem;
          font-variant-numeric: tabular-nums;
        }

        .col-tencent-meeting {
          min-width: 7.5rem;
        }

        .admin-jpl-subject-badge {
          display: inline-block;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          color: var(--muted);
          font-size: 0.6875rem;
          font-weight: 600;
          line-height: 1.35;
          white-space: nowrap;
        }
      
      `}</style>
  );
}
