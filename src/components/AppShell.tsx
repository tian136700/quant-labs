"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { useSiteNavItems } from "@/hooks/useSiteNavItems";
import {
  isJpLessonPath,
  isJpModulePath,
  isJpReviewPath,
  isJpVocabPath,
  isJpVocabRefPath,
  isMaintenancePath,
  jpLessonPath,
  jpVocabPath,
} from "@/lib/locale-path";
import { JpVocabTeacherRouteGuard } from "./JpVocabTeacherRouteGuard";
import { MaintenanceRouteGuard } from "./MaintenanceRouteGuard";
import { LangSwitch } from "./LangSwitch";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { SiteAuthBar } from "./SiteAuthBar";
import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onMaintenance = isMaintenancePath(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = useSiteNavItems();
  const { t } = useI18n();
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const onJpVocabRef = isJpVocabRefPath(pathname);
  const onJpModule = isJpModulePath(pathname);

  const headerTitle = useMemo(() => {
    const active = items.find((item) => item.active);
    if (active) return active.label;
    const nav = t("nav");
    if (isJpLessonPath(pathname)) return nav.jpLesson;
    if (isJpVocabPath(pathname)) return nav.jpVocab;
    if (isJpReviewPath(pathname)) return nav.jpReview;
    return t("meta").title;
  }, [items, pathname, t]);

  const headerHref = useMemo(() => {
    const active = items.find((item) => item.active);
    if (active) return active.href;
    if (isJpLessonPath(pathname)) return jpLessonPath();
    if (isJpVocabPath(pathname)) return jpVocabPath();
    return items[0]?.href ?? "/";
  }, [items, pathname]);

  if (onMaintenance || onJpVocabRef) {
    return (
      <>
        <MaintenanceRouteGuard />
        <JpVocabTeacherRouteGuard />
        <main>{children}</main>
      </>
    );
  }

  return (
    <div className="page-wrap">
      <MaintenanceRouteGuard />
      <JpVocabTeacherRouteGuard />
      <header className="page-header">
        <div className="mobile-header-bar">
          <Link href={headerHref} className="mobile-header-title">
            {headerTitle}
          </Link>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={t("nav").ariaLabel}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="mobile-menu-icon" aria-hidden />
          </button>
        </div>
        <SiteNav />
        <div className="page-header-tools page-header-tools--desktop">
          <SiteAuthBar />
          {onJpModule ? null : <LangSwitch />}
        </div>
        <MobileNavDrawer
          id="mobile-nav-drawer"
          open={drawerOpen}
          onClose={closeDrawer}
        />
      </header>
      <main>{children}</main>
    </div>
  );
}
