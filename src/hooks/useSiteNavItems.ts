"use client";

import { usePathname } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useStoreReviewSubdomain } from "@/hooks/useStoreReviewSubdomain";
import { useI18n } from "@/i18n/I18nProvider";
import {
  isAboutPath,
  isAdminDashboardPath,
  isAdminRbacPath,
  isAdminTrendsPath,
  isAdminToolCodesPath,
  isAdminUsersPath,
  isComparePath,
  isJpLessonPath,
  isJpVocabPath,
  isJpVocabStudyPath,
  isStoreReviewHomePath,
  isStoreReviewPlazaPath,
  isTeacherReviewPath,
} from "@/lib/locale-path";
import { navHref } from "@/lib/nav-href";

export type SiteNavItem = {
  id: string;
  href: string;
  label: string;
  active: boolean;
};

export function useSiteNavItems(): SiteNavItem[] {
  const { locale, t } = useI18n();
  const { user, isAdmin, hasPermission, checking } = useEtrAuth();
  const loggedIn = Boolean(user);
  const jpTeacherNav =
    loggedIn && hasPermission("nav:jp_teacher") && !hasPermission("nav:full");
  const pathname = usePathname() ?? "/";
  const nav = t("nav");
  const onSubdomain = useStoreReviewSubdomain();
  const navOpts = { onSubdomain, isAdmin };
  const showFullNav = !onSubdomain || isAdmin;
  const onJpLesson = isJpLessonPath(pathname);
  const onJpVocab = isJpVocabPath(pathname);
  const onJpVocabStudy = isJpVocabStudyPath(pathname);
  const onHiddenJp = onJpLesson || onJpVocab || onJpVocabStudy;

  if (!loggedIn && !checking) {
    return [
      {
        id: "about",
        href: navHref("about", locale, navOpts),
        label: nav.about,
        active: isAboutPath(pathname),
      },
    ];
  }

  if (jpTeacherNav) {
    return [
      {
        id: "jpVocab",
        href: navHref("jpVocab", locale, navOpts),
        label: nav.jpVocab,
        active: onJpVocab && !onJpVocabStudy,
      },
      {
        id: "jpVocabStudy",
        href: navHref("jpVocabStudy", locale, navOpts),
        label: nav.jpVocabStudy,
        active: onJpVocabStudy,
      },
      {
        id: "jpLesson",
        href: navHref("jpLesson", locale, navOpts),
        label: nav.jpLesson,
        active: onJpLesson,
      },
      {
        id: "about",
        href: navHref("about", locale, navOpts),
        label: nav.about,
        active: isAboutPath(pathname),
      },
    ];
  }

  if (onHiddenJp && loggedIn && !hasPermission("nav:full")) {
    return [
      ...(onJpVocab
        ? [
            {
              id: "jpVocab",
              href: navHref("jpVocab", locale, navOpts),
              label: nav.jpVocab,
              active: !onJpVocabStudy,
            },
          ]
        : []),
      ...(onJpVocabStudy
        ? [
            {
              id: "jpVocabStudy",
              href: navHref("jpVocabStudy", locale, navOpts),
              label: nav.jpVocabStudy,
              active: true,
            },
          ]
        : []),
      ...(onJpLesson
        ? [
            {
              id: "jpLesson",
              href: navHref("jpLesson", locale, navOpts),
              label: nav.jpLesson,
              active: true,
            },
          ]
        : []),
      {
        id: "about",
        href: navHref("about", locale, navOpts),
        label: nav.about,
        active: isAboutPath(pathname),
      },
    ];
  }

  if (showFullNav) {
    return [
      ...(checking || !hasPermission("nav:full")
        ? []
        : [
            ...(hasPermission("compare:view")
              ? [
                  {
                    id: "compare",
                    href: navHref("compare", locale, navOpts),
                    label: nav.strategyCompare,
                    active: isComparePath(pathname),
                  },
                ]
              : []),
            ...(hasPermission("etr:use")
              ? [
                  {
                    id: "teacherReview",
                    href: navHref("teacherReview", locale, navOpts),
                    label: nav.teacherReview,
                    active: isTeacherReviewPath(pathname),
                  },
                ]
              : []),
            ...(hasPermission("admin:dashboard")
              ? [
                  {
                    id: "admin",
                    href: navHref("admin", locale, navOpts),
                    label: nav.adminDashboard,
                    active: isAdminDashboardPath(pathname),
                  },
                ]
              : []),
            ...(hasPermission("admin:trends")
              ? [
                  {
                    id: "adminTrends",
                    href: navHref("adminTrends", locale, navOpts),
                    label: nav.adminTrends,
                    active: isAdminTrendsPath(pathname),
                  },
                ]
              : []),
            ...(isAdmin
              ? [
                  {
                    id: "adminRbac",
                    href: navHref("adminRbac", locale, navOpts),
                    label: nav.adminRbac,
                    active: isAdminRbacPath(pathname),
                  },
                  {
                    id: "adminUsers",
                    href: navHref("adminUsers", locale, navOpts),
                    label: nav.adminUsers,
                    active: isAdminUsersPath(pathname),
                  },
                  {
                    id: "adminToolCodes",
                    href: navHref("adminToolCodes", locale, navOpts),
                    label: nav.adminToolCodes,
                    active: isAdminToolCodesPath(pathname),
                  },
                ]
              : []),
            ...(hasPermission("jp_lesson:read") ||
            hasPermission("jp_lesson:operate")
              ? [
                  {
                    id: "jpLesson",
                    href: navHref("jpLesson", locale, navOpts),
                    label: nav.jpLesson,
                    active: onJpLesson,
                  },
                ]
              : []),
            ...(hasPermission("jp_vocab:read") ||
            hasPermission("jp_vocab:operate")
              ? [
                  {
                    id: "jpVocab",
                    href: navHref("jpVocab", locale, navOpts),
                    label: nav.jpVocab,
                    active: onJpVocab && !onJpVocabStudy,
                  },
                  {
                    id: "jpVocabStudy",
                    href: navHref("jpVocabStudy", locale, navOpts),
                    label: nav.jpVocabStudy,
                    active: onJpVocabStudy,
                  },
                ]
              : []),
          ]),
      ...(hasPermission("store_review:use")
        ? [
            {
              id: "storeReview",
              href: navHref("storeReview", locale, navOpts),
              label: nav.storeReview,
              active: isStoreReviewHomePath(pathname),
            },
          ]
        : []),
      {
        id: "about",
        href: navHref("about", locale, navOpts),
        label: nav.about,
        active: isAboutPath(pathname),
      },
    ];
  }

  return loggedIn
    ? [
        {
          id: "storeReview",
          href: navHref("storeReview", locale, navOpts),
          label: nav.storeReview,
          active: isStoreReviewHomePath(pathname),
        },
        {
          id: "storeReviewPlaza",
          href: navHref("storeReviewPlaza", locale, navOpts),
          label: t("storeReview").plaza.title,
          active: isStoreReviewPlazaPath(pathname),
        },
      ]
    : [
        {
          id: "about",
          href: navHref("about", locale, navOpts),
          label: nav.about,
          active: isAboutPath(pathname),
        },
      ];
}
