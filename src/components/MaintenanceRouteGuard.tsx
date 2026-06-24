"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { isMaintenancePath, maintenancePath } from "@/lib/locale-path";

/** 被禁用账号：统一跳转到功能维护页，不暴露封禁原因 */
export function MaintenanceRouteGuard() {
  const { maintenance, checking } = useEtrAuth();
  const { locale } = useI18n();
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  useEffect(() => {
    if (checking || !maintenance || isMaintenancePath(pathname)) return;
    router.replace(maintenancePath(locale));
  }, [checking, maintenance, pathname, locale, router]);

  return null;
}
