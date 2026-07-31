"use client";

import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/messages";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

export type AdminUsersCredentialsConfirm = {
  username: string;
  password: string;
};

export type AdminUsersCredentialsConfirmModalProps = {
  open: boolean;
  mounted: boolean;
  locale: Locale;
  credentials: AdminUsersCredentialsConfirm | null;
  onClose: () => void;
};

/** 复制账号密码成功后弹出，方便当场核对用户名/密码是否正确。 */
export function AdminUsersCredentialsConfirmModal({
  open,
  mounted,
  locale,
  credentials,
  onClose,
}: AdminUsersCredentialsConfirmModalProps) {
  if (!mounted || !open || !credentials) return null;

  const zh = locale === "zh";

  return createPortal(
    <div
      className="admin-users-modal-overlay"
      onMouseDown={(e) => {
        closeModalOnBackdropMouseDown(e, onClose);
      }}
    >
      <div
        className="admin-users-modal admin-users-credentials-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-credentials-confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-users-modal-header">
          <div>
            <h2
              id="admin-users-credentials-confirm-title"
              className="admin-users-modal-title"
            >
              {zh ? "请核对已复制的账号密码" : "Confirm copied credentials"}
            </h2>
            <p className="admin-users-modal-subtitle">
              {zh
                ? "已写入剪贴板。请确认下面用户名、密码无误后再关闭。"
                : "Copied to the clipboard. Confirm username and password below, then close."}
            </p>
          </div>
          <button
            type="button"
            className="admin-users-modal-close"
            aria-label={zh ? "关闭" : "Close"}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="admin-users-modal-body">
          <dl className="admin-users-credentials-confirm-list">
            <div className="admin-users-credentials-confirm-row">
              <dt>{zh ? "用户名" : "Username"}</dt>
              <dd>
                <code className="admin-users-credentials-confirm-value">
                  {credentials.username}
                </code>
              </dd>
            </div>
            <div className="admin-users-credentials-confirm-row">
              <dt>{zh ? "密码" : "Password"}</dt>
              <dd>
                <code className="admin-users-credentials-confirm-value">
                  {credentials.password}
                </code>
              </dd>
            </div>
          </dl>
        </div>

        <div className="admin-users-modal-footer admin-users-credentials-confirm-footer">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={onClose}
            autoFocus
          >
            {zh ? "确认无误" : "Looks correct"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
