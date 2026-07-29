"use client";

import Link from "next/link";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { AdminWorkerTrafficPanel } from "@/components/admin-dashboard/AdminWorkerTrafficPanel";
import { adminPath } from "@/lib/locale-path";

/** Worker 日请求 / Error 1027 流量检测看板（与访问日志页分开） */
export function AdminWorkerTrafficPage() {
  const { locale, t } = useI18n();
  const page = t("adminWorkerTraffic");
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

      <AdminWorkerTrafficPanel />
    </div>
  );
}
