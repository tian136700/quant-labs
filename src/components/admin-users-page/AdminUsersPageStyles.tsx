"use client";

/** Extracted from AdminUsersPage.tsx. */
export function AdminUsersPageStyles() {
  return (
    <style jsx global>{`
        .admin-users-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .admin-users-toolbar-actions {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .admin-users-toolbar-sub {
          margin: 0.25rem 0 0;
        }
        .admin-users-search-bar {
          align-items: flex-end;
        }
        .admin-users-search-meta {
          margin: -0.35rem 0 0.75rem;
        }
        .admin-users-search-empty {
          margin: 0 0 0.5rem;
        }
        .admin-users-mobile-sort {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.85rem;
        }
        @media (min-width: 1024px) {
          .admin-users-mobile-sort {
            display: none;
          }
        }
        .admin-users-mobile-sort-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-user-card .admin-user-actions {
          margin-top: 0.85rem;
          padding-top: 0.85rem;
          border-top: 1px solid var(--border);
        }
        .admin-users-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          z-index: 80;
        }
        .admin-users-modal {
          width: min(720px, 100%);
          max-height: min(84vh, 860px);
          overflow: auto;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
        }
        .admin-users-modal--wide {
          width: min(920px, 100%);
        }
        .admin-users-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 1rem 1.1rem 0.75rem;
          border-bottom: 1px solid var(--border);
          background: rgba(0, 0, 0, 0.08);
        }
        .admin-users-modal-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 650;
        }
        .admin-users-modal-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.85rem;
          color: var(--muted);
          line-height: 1.35;
        }
        .admin-users-modal-close {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--muted);
          border-radius: 10px;
          width: 2.25rem;
          height: 2.25rem;
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          flex: 0 0 auto;
        }
        .admin-users-modal-body {
          padding: 1rem 1.1rem 1.1rem;
        }
        .admin-users-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 0.9rem;
          flex-wrap: wrap;
        }
        .admin-users-templates-body .admin-login-link-template-select {
          max-width: 24rem;
        }
        .admin-user-add-section {
          margin-bottom: 1.25rem;
        }
        .admin-user-add-title {
          margin: 0 0 0.85rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .admin-user-add-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
          gap: 0.75rem 1rem;
          align-items: end;
        }
        .admin-user-add-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-user-add-field input,
        .admin-user-add-field select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
        }
        .admin-user-add-field input.admin-user-add-field--invalid {
          border-color: var(--rise);
        }
        .admin-user-add-field-error {
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--rise);
        }
        .admin-user-add-modal-error {
          margin: 0;
          grid-column: 1 / -1;
          font-size: 0.8125rem;
          color: var(--rise);
        }
        .admin-user-add-submit {
          justify-self: start;
          min-height: 2.35rem;
        }
        .admin-user-add-hint {
          margin: 0.75rem 0 0;
        }
        .admin-rbac-section {
          margin-bottom: 1.25rem;
        }
        .admin-rbac-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
        }
        .admin-rbac-table {
          width: 100%;
          min-width: 72rem;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        /* 禁止靠拉宽表 + 横滑挤掉操作列；窄列折行，操作按钮必须完整可见 */
        .admin-table-wrap:has(.admin-users-table) {
          overflow-x: hidden;
        }
        .admin-users-table {
          table-layout: fixed;
          width: 100%;
          min-width: 0;
        }
        /* 覆盖通用 .admin-rbac-table { min-width: 72rem }，避免逼出横滑裁掉操作列 */
        .admin-rbac-table.admin-users-table {
          min-width: 0;
          width: 100%;
        }
        .admin-rbac-table th,
        .admin-rbac-table td {
          border: 1px solid var(--border);
          padding: 0.55rem 0.5rem;
          vertical-align: middle;
        }
        .admin-rbac-table td {
          text-align: left;
        }
        .admin-rbac-table th {
          background: var(--panel);
          font-weight: 600;
          white-space: nowrap;
          text-align: center;
        }
        .admin-user-sort-btn {
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: inherit;
          padding: 0;
          cursor: pointer;
          white-space: nowrap;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        :global(.admin-users-table .admin-user-col-id) {
          width: 3.25rem;
          text-align: center;
        }
        :global(.admin-users-table .admin-user-col-username) {
          width: 7.25rem;
          min-width: 5.5rem;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.35;
          vertical-align: top;
        }
        :global(.admin-users-table .admin-user-col-role) {
          width: 3.75rem;
        }
        :global(.admin-users-table .admin-user-col-teacher) {
          width: 6.25rem;
          vertical-align: top;
          white-space: normal;
        }
        :global(.admin-user-teacher-bound) {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.45rem;
          max-width: 100%;
        }
        :global(.admin-user-teacher-name) {
          min-width: 0;
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.3;
        }
        :global(.admin-user-bind-teacher-btn) {
          white-space: nowrap;
          padding: 0.2rem 0.45rem;
          font-size: 0.75rem;
          line-height: 1.2;
        }
        :global(.admin-user-rebind-teacher-btn) {
          flex-shrink: 0;
        }
        :global(.admin-users-table .admin-user-col-created),
        :global(.admin-users-table .admin-user-col-login) {
          width: 5.75rem;
          min-width: 5.25rem;
          max-width: 6.25rem;
          font-size: 0.8125rem;
          white-space: normal;
          overflow: visible;
          vertical-align: top;
          font-variant-numeric: tabular-nums;
        }
        :global(.admin-user-dt-stacked) {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.08rem;
          line-height: 1.2;
        }
        :global(.admin-user-dt-date),
        :global(.admin-user-dt-time) {
          display: block;
          white-space: nowrap;
        }
        :global(.admin-user-dt-time) {
          color: var(--muted);
          font-size: 0.75rem;
        }
        :global(.admin-users-table .admin-user-col-status) {
          width: 3.75rem;
          text-align: center;
          white-space: normal;
          vertical-align: top;
          line-height: 1.3;
        }
        :global(.admin-user-ip-col) {
          width: 7rem;
          max-width: 7.5rem;
          vertical-align: top;
          white-space: normal !important;
        }
        :global(.admin-user-ip) {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
          max-width: 100%;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.8125rem;
          letter-spacing: -0.01em;
          line-height: 1.35;
          word-break: break-all;
        }
        :global(.admin-user-ip-text) {
          display: block;
          max-width: 100%;
        }
        :global(.admin-user-ip--collapsed .admin-user-ip-text) {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: normal;
        }
        :global(.admin-user-ip-toggle) {
          border: 0;
          background: transparent;
          color: #6eb5ff;
          font: inherit;
          font-size: 0.75rem;
          line-height: 1.2;
          padding: 0;
          cursor: pointer;
          white-space: nowrap;
        }
        :global(.admin-user-ip-toggle:hover) {
          text-decoration: underline;
        }
        :global(.admin-user-ip-history) {
          border: 0;
          background: transparent;
          color: #6eb5ff;
          font: inherit;
          font-size: 0.75rem;
          line-height: 1.2;
          padding: 0;
          cursor: pointer;
          white-space: normal;
          text-align: left;
        }
        :global(.admin-user-ip-history:hover) {
          text-decoration: underline;
        }
        :global(.admin-user-login-history-body) {
          padding: 0.85rem 1.1rem 1.1rem;
        }
        :global(.admin-user-login-history-table-wrap) {
          overflow-x: auto;
          overflow-y: clip;
          max-width: 100%;
        }
        :global(.admin-user-login-history-table) {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        :global(.admin-user-login-history-table th),
        :global(.admin-user-login-history-table td) {
          padding: 0.45rem 0.55rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: top;
        }
        :global(.admin-user-login-history-table th) {
          color: var(--muted);
          font-weight: 600;
          font-size: 0.78rem;
        }
        :global(.admin-user-login-history-ip) {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.8125rem;
          word-break: break-all;
        }
        :global(.admin-user-login-history-region) {
          font-size: 0.8125rem;
          line-height: 1.35;
          color: var(--text);
          word-break: break-word;
        }
        :global(.admin-user-login-history-enrich) {
          margin: 0 0 0.65rem;
        }
        :global(.admin-user-actions-col) {
          width: 15.5rem;
          min-width: 15rem;
          vertical-align: top;
          white-space: normal !important;
        }
        .admin-rbac-table tbody tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .admin-rbac-username {
          font-weight: 600;
          white-space: normal;
          overflow: visible;
          text-overflow: unset;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.35;
        }
        .admin-user-card .strategy-card-title {
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          line-height: 1.35;
          align-items: flex-start;
        }
        /* 一行两个按钮（对齐新课操作列），避免三列过窄裁字/裁按钮 */
        .admin-user-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.4rem;
          align-items: stretch;
          justify-items: stretch;
          width: 100%;
        }
        .admin-user-btn {
          width: 100%;
          white-space: normal;
          text-align: center;
          line-height: 1.25;
          min-height: 2.1rem;
        }
        .admin-user-never-disable-badge {
          display: block;
          margin-top: 0.15rem;
          color: var(--fall);
          font-weight: 600;
          white-space: normal;
          line-height: 1.25;
        }
        .admin-user-row--highlight {
          background: rgba(110, 181, 255, 0.14) !important;
          box-shadow: inset 0 0 0 1px rgba(110, 181, 255, 0.45);
        }
        .admin-login-link-templates-section {
          margin-bottom: 1.25rem;
        }
        .admin-login-link-templates-hint {
          margin: 0 0 0.85rem;
        }
        .admin-login-link-template-select {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-width: 20rem;
          margin-bottom: 0.85rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-login-link-template-select select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
        }
        .admin-login-link-templates-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .admin-login-link-template-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem 0.85rem;
          background: rgba(255, 255, 255, 0.02);
        }
        .admin-login-link-template-head {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .admin-login-link-template-body {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: inherit;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.5;
        }
        .admin-login-link-template-add {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding-top: 0.85rem;
          border-top: 1px solid var(--border);
        }
        .admin-login-link-template-add-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
        }
        .admin-login-link-template-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-login-link-template-field input,
        .admin-login-link-template-field textarea {
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
        }
        .admin-login-link-template-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
        }
      `}</style>
  );
}
