"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNavPreferences } from "@/contexts/NavPreferencesProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { useSiteNavItems } from "@/hooks/useSiteNavItems";
import {
  isEnLessonPath,
  isEnModulePath,
  isEnVocabPath,
  isEnVocabAdminPath,
  isEnVocabRefPath,
  isKoPronPath,
  isKoPronAdminPath,
  isKoPronStudyPath,
  isJpLessonPath,
  isJpModulePath,
  isJpReviewPath,
  isJpVocabPath,
  isJpVocabAdminPath,
  isJpVocabRefPath,
  isMaintenancePath,
  isComparePath,
  adminJpLessonTeachersPath,
  enLessonPath,
  enVocabPath,
  enVocabAdminPath,
  koPronPath,
  koPronAdminPath,
  koPronStudyPath,
  isAdminJpLessonTeachersPath,
  jpLessonPath,
  jpVocabPath,
  jpVocabAdminPath,
} from "@/lib/locale-path";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { EnVocabTeacherRouteGuard } from "./EnVocabTeacherRouteGuard";
import { JpVocabTeacherRouteGuard } from "./JpVocabTeacherRouteGuard";
import { KoPronTeacherRouteGuard } from "./KoPronTeacherRouteGuard";
import { MaintenanceRouteGuard } from "./MaintenanceRouteGuard";
import { LangSwitch } from "./LangSwitch";
import { NavDrawer } from "./NavDrawer";
import { SiteAuthBar } from "./SiteAuthBar";
import { SiteNav } from "./SiteNav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const onMaintenance = isMaintenancePath(pathname);
  const { user, checking, isAdmin } = useEtrAuth();
  const compareGatedShell =
    COMPARE_ADMIN_ONLY &&
    isComparePath(pathname) &&
    (checking || !user || !isAdmin);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = useSiteNavItems();
  const { recordVisit } = useNavPreferences();
  const { locale, t } = useI18n();
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  const activeItemId = useMemo(
    () => items.find((item) => item.active)?.id,
    [items]
  );

  useEffect(() => {
    if (activeItemId) recordVisit(activeItemId);
  }, [activeItemId, recordVisit]);

  const onJpVocabRef = isJpVocabRefPath(pathname);
  const onEnVocabRef = isEnVocabRefPath(pathname);
  const onJpModule = isJpModulePath(pathname);
  const onEnModule = isEnModulePath(pathname);
  const onKoModule = isKoPronPath(pathname);
  const onLearningModule = onJpModule || onEnModule || onKoModule;

  const headerTitle = useMemo(() => {
    const active = items.find((item) => item.active);
    if (active) return active.label;
    const nav = t("nav");
    if (isAdminJpLessonTeachersPath(pathname)) return nav.adminJpLessonTeachers;
    if (isJpLessonPath(pathname)) return nav.jpLesson;
    if (isJpVocabAdminPath(pathname)) return nav.jpVocabAdmin;
    if (isJpVocabPath(pathname)) return nav.jpVocab;
    if (isEnLessonPath(pathname)) return nav.enLesson;
    if (isEnVocabAdminPath(pathname)) return nav.enVocabAdmin;
    if (isEnVocabPath(pathname)) return nav.enVocab;
    if (isKoPronAdminPath(pathname)) return nav.koPronAdmin;
    if (isKoPronStudyPath(pathname)) return nav.koPronStudy;
    if (isKoPronPath(pathname)) return nav.koPron;
    if (isJpReviewPath(pathname)) return nav.jpReview;
    return t("meta").title;
  }, [items, locale, pathname, t]);

  const headerHref = useMemo(() => {
    const active = items.find((item) => item.active);
    if (active) return active.href;
    if (isJpLessonPath(pathname)) return jpLessonPath();
    if (isJpVocabAdminPath(pathname)) return jpVocabAdminPath();
    if (isJpVocabPath(pathname)) return jpVocabPath();
    if (isEnLessonPath(pathname)) return enLessonPath();
    if (isEnVocabAdminPath(pathname)) return enVocabAdminPath();
    if (isEnVocabPath(pathname)) return enVocabPath();
    if (isKoPronAdminPath(pathname)) return koPronAdminPath();
    if (isKoPronStudyPath(pathname)) return koPronStudyPath();
    if (isKoPronPath(pathname)) return koPronPath();
    if (isAdminJpLessonTeachersPath(pathname)) return adminJpLessonTeachersPath(locale);
    return items[0]?.href ?? "/";
  }, [items, locale, pathname]);

  if (onMaintenance || onJpVocabRef || onEnVocabRef || compareGatedShell) {
    return (
      <>
        <MaintenanceRouteGuard />
        <JpVocabTeacherRouteGuard />
        <EnVocabTeacherRouteGuard />
        <KoPronTeacherRouteGuard />
        <main>{children}</main>
      </>
    );
  }

  return (
    <div className="page-wrap">
      <MaintenanceRouteGuard />
      <JpVocabTeacherRouteGuard />
      <EnVocabTeacherRouteGuard />
      <KoPronTeacherRouteGuard />
      <header className="page-header">
        <div className="mobile-header-bar">
          <Link
            href={headerHref}
            className="mobile-header-title"
            aria-current="page"
            title={headerTitle}
          >
            {headerTitle}
          </Link>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-expanded={drawerOpen}
            aria-controls="site-nav-drawer"
            aria-label={t("nav").ariaLabel}
            onClick={toggleDrawer}
          >
            <span className="mobile-menu-icon" aria-hidden />
          </button>
        </div>
        <SiteNav drawerOpen={drawerOpen} onToggleDrawer={toggleDrawer} />
        <div className="page-header-tools page-header-tools--desktop">
          <SiteAuthBar />
          {onLearningModule ? null : <LangSwitch />}
        </div>
        <NavDrawer
          id="site-nav-drawer"
          open={drawerOpen}
          onClose={closeDrawer}
          showTools
        />
      </header>
      <main>{children}</main>
    </div>
  );
}
