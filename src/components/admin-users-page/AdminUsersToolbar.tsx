"use client";

import type { Locale } from "@/i18n/messages";

export type AdminUsersToolbarProps = {
  locale: Locale;
  templateCount: number;
  onOpenAddUser: () => void;
  onOpenTemplates: () => void;
};

export function AdminUsersToolbar({
  locale,
  templateCount,
  onOpenAddUser,
  onOpenTemplates,
}: AdminUsersToolbarProps) {
  return (
    <section className="section etr-panel admin-rbac-section admin-users-toolbar-section">
      <div className="admin-users-toolbar">
        <div className="admin-users-toolbar-title">
          <h2 className="admin-user-add-title">
            {locale === "zh" ? "快捷操作" : "Quick actions"}
          </h2>
          <p className="hint admin-users-toolbar-sub">
            {locale === "zh"
              ? templateCount > 0
                ? `已有 ${templateCount} 个模板；点「带模板复制」时再选要用哪一个。`
                : "尚未添加模板；可先点「管理登录模板」添加多个。"
              : templateCount > 0
                ? `${templateCount} template(s). Pick one when using Copy with template.`
                : "No templates yet. Add several under Manage templates."}
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
          <button type="button" className="btn-rsi-filter" onClick={onOpenTemplates}>
            {locale === "zh" ? "管理登录模板" : "Manage templates"}
          </button>
        </div>
      </div>
    </section>
  );
}
