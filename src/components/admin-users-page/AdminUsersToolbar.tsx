"use client";

import type { Locale } from "@/i18n/messages";
import type { LoginLinkTemplate } from "@/lib/types";

export type AdminUsersToolbarProps = {
  locale: Locale;
  selectedTemplate: LoginLinkTemplate | null;
  onOpenAddUser: () => void;
  onOpenTemplates: () => void;
};

export function AdminUsersToolbar({ locale, selectedTemplate, onOpenAddUser, onOpenTemplates }: AdminUsersToolbarProps) {
  return (
      <section className="section etr-panel admin-rbac-section admin-users-toolbar-section">
        <div className="admin-users-toolbar">
          <div className="admin-users-toolbar-title">
            <h2 className="admin-user-add-title">{locale === "zh" ? "快捷操作" : "Quick actions"}</h2>
            <p className="hint admin-users-toolbar-sub">
              {selectedTemplate
                ? locale === "zh"
                  ? `当前模板：${selectedTemplate.name}`
                  : `Active template: ${selectedTemplate.name}`
                : locale === "zh"
                  ? "当前模板：未选择（带模板复制将不可用）"
                  : "Active template: none (copy with template disabled)"}
            </p>
          </div>
          <div className="admin-users-toolbar-actions">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={onOpenAddUser}
            >
              {locale === "zh" ? "添加用户" : "Add user"}
            </button>
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onOpenTemplates}
            >
              {locale === "zh" ? "管理登录模板" : "Manage templates"}
            </button>
          </div>
        </div>
      </section>
  );
}
