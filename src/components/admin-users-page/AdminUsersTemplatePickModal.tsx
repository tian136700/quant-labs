"use client";

import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/messages";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { LoginLinkTemplate } from "@/lib/types";

export type AdminUsersTemplatePickModalProps = {
  open: boolean;
  mounted: boolean;
  locale: Locale;
  username: string;
  templates: LoginLinkTemplate[];
  preferredTemplateId: number | null;
  busy: boolean;
  onClose: () => void;
  onPick: (template: LoginLinkTemplate) => void;
};

export function AdminUsersTemplatePickModal({
  open,
  mounted,
  locale,
  username,
  templates,
  preferredTemplateId,
  busy,
  onClose,
  onPick,
}: AdminUsersTemplatePickModalProps) {
  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="admin-users-modal-overlay"
      onMouseDown={(e) => {
        if (busy) return;
        closeModalOnBackdropMouseDown(e, onClose);
      }}
    >
      <div
        className="admin-users-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-template-pick-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-users-modal-header">
          <div>
            <h2 id="admin-users-template-pick-title" className="admin-users-modal-title">
              {locale === "zh" ? "选择复制模板" : "Choose a template"}
            </h2>
            <p className="admin-users-modal-subtitle">
              {locale === "zh"
                ? `为「${username}」带模板复制：选好模板后会写入用户名、密码与抽查链接。`
                : `Copy for "${username}" with a template, then username, password, and quiz link.`}
            </p>
          </div>
          <button
            type="button"
            className="admin-users-modal-close"
            aria-label={locale === "zh" ? "关闭" : "Close"}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="admin-users-modal-body admin-users-template-pick-body">
          {templates.length === 0 ? (
            <p className="hint">
              {locale === "zh"
                ? "暂无模板，请先在「管理登录模板」里添加。"
                : "No templates yet. Add one under Manage templates."}
            </p>
          ) : (
            <ul className="admin-users-template-pick-list">
              {templates.map((template) => {
                const preferred = preferredTemplateId === template.id;
                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      className={`admin-users-template-pick-item${
                        preferred ? " admin-users-template-pick-item--preferred" : ""
                      }`}
                      disabled={busy}
                      onClick={() => onPick(template)}
                    >
                      <span className="admin-users-template-pick-item-name">
                        {template.name}
                        {preferred
                          ? locale === "zh"
                            ? "（常用）"
                            : " (usual)"
                          : ""}
                      </span>
                      <span className="admin-users-template-pick-item-preview">
                        {template.body.trim().slice(0, 80)}
                        {template.body.trim().length > 80 ? "…" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {busy ? (
            <p className="hint" aria-live="polite">
              {locale === "zh" ? "正在复制…" : "Copying…"}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
