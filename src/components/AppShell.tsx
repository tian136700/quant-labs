"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isMaintenancePath } from "@/lib/locale-path";
import { JpVocabTeacherRouteGuard } from "./JpVocabTeacherRouteGuard";
import { MaintenanceRouteGuard } from "./MaintenanceRouteGuard";
import { LangSwitch } from "./LangSwitch";
import { SiteAuthBar } from "./SiteAuthBar";
import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onMaintenance = isMaintenancePath(pathname);

  if (onMaintenance) {
    return <main>{children}</main>;
  }

  return (
    <div className="page-wrap">
      <MaintenanceRouteGuard />
      <JpVocabTeacherRouteGuard />
      <header className="page-header">
        <SiteNav />
        <div className="page-header-tools">
          <SiteAuthBar />
          <LangSwitch />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
