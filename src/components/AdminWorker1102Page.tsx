"use client";

import Link from "next/link";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { AdminWorker1102Panel } from "@/components/admin-dashboard/AdminWorker1102Panel";
import { adminPath } from "@/lib/locale-path";

/** Worker Error 1102 诊断看板（与流量检测 / 访问日志分开） */
export function AdminWorker1102Page() {
  const { locale, t } = useI18n();
  const page = t("adminWorker1102");
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

      <AdminWorker1102Panel />
    </div>
  );
}
