"use client";

import Link from "next/link";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { AdminD1QuotaPanel } from "@/components/admin-dashboard/AdminD1QuotaPanel";
import { adminPath } from "@/lib/locale-path";

/** D1 日读/写行数配额诊断看板 */
export function AdminD1QuotaPage() {
  const { locale, t } = useI18n();
  const page = t("adminD1Quota");
  const { isAdmin, hasPermission, checking } = useEtrAuth();
  const canAccess = isAdmin || hasPermission("admin:dashboard");

  if (checking || !canAccess) {
    return (
      <AdminAuthGate
        title={page.page.title}
        required={page.auth.required}
        login={page.auth.login}
        registered={!checking && canAccess}
      />
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{page.page.title}</h1>
        <AdminAuthUserStatus registered={canAccess} />
        <p className="sub">{page.page.subtitle}</p>
        <p className="hint">
          <Link href={adminPath(locale)}>{page.page.backToAdmin}</Link>
        </p>
      </div>

      <AdminD1QuotaPanel />
    </div>
  );
}
