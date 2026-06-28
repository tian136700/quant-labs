"use client";

import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import type { EtrUserRole } from "@/lib/etr-auth";
import { RBAC_ROLE_LABELS } from "@/lib/rbac";

type Props = {
  /** 已在后台具备当前页所需管理权限 */
  registered: boolean;
};

function roleLabel(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.zh : item.en;
}

export function AdminAuthUserStatus({ registered }: Props) {
  const { user, checking } = useEtrAuth();
  const { locale, t } = useI18n();
  const auth = t("adminDashboard").auth;

  if (checking) {
    return (
      <p className="admin-auth-user-status admin-auth-user-status--checking">
        {auth.checking}
      </p>
    );
  }

  if (registered && user) {
    return (
      <p className="admin-auth-user-status admin-auth-user-status--registered">
        <span className="admin-auth-user-label">{auth.currentUser}</span>
        <span className="admin-auth-user-role">{roleLabel(user.role, locale)}</span>
        <span className="admin-auth-user-name">{user.username}</span>
      </p>
    );
  }

  return (
    <p className="admin-auth-user-status admin-auth-user-status--guest">
      {auth.unregistered}
    </p>
  );
}
