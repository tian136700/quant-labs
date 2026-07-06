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
  isJpLessonSchedulePath,
  isJpVocabPath,
  isJpVocabStudyPath,
  isEnLessonPath,
  isEnVocabPath,
  isEnVocabStudyPath,
  isStoreReviewHomePath,
  isStoreReviewPlazaPath,
  isTeacherReviewPath,
} from "@/lib/locale-path";
import { navHref } from "@/lib/nav-href";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";

export type SiteNavItem = {
  id: string;
  href: string;
  label: string;
  active: boolean;
};

export function useSiteNavItems(): SiteNavItem[] {
  const { locale, t } = useI18n();
  const { user, isAdmin, hasPermission, checking, canAccessJpVocabStudy, canAccessEnVocabStudy } = useEtrAuth();
  const loggedIn = Boolean(user);
  const jpTeacherNav =
    loggedIn && hasPermission("nav:jp_teacher") && !hasPermission("nav:full");
  const enTeacherNav =
    loggedIn && hasPermission("nav:en_teacher") && !hasPermission("nav:full");
  const pathname = usePathname() ?? "/";
  const nav = t("nav");
  const onSubdomain = useStoreReviewSubdomain();
  const navOpts = { onSubdomain, isAdmin };
  const showFullNav = !onSubdomain || isAdmin;
  const onJpLesson = isJpLessonPath(pathname);
  const onJpLessonSchedule = isJpLessonSchedulePath(pathname);
  const onJpLessonMain = onJpLesson && !onJpLessonSchedule;
  const onJpVocab = isJpVocabPath(pathname);
  const onJpVocabStudy = isJpVocabStudyPath(pathname);
  const onEnLesson = isEnLessonPath(pathname);
  const onEnVocab = isEnVocabPath(pathname);
  const onEnVocabStudy = isEnVocabStudyPath(pathname);
  const onHiddenJp = onJpLesson || onJpVocab || onJpVocabStudy;
  const onHiddenEn = onEnLesson || onEnVocab || onEnVocabStudy;

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

  if (enTeacherNav) {
    return [
      {
        id: "enVocab",
        href: navHref("enVocab", locale, navOpts),
        label: nav.enVocab,
        active: onEnVocab && !onEnVocabStudy,
      },
      ...(canAccessEnVocabStudy
        ? [
            {
              id: "enVocabStudy",
              href: navHref("enVocabStudy", locale, navOpts),
              label: nav.enVocabStudy,
              active: onEnVocabStudy,
            },
          ]
        : []),
      {
        id: "enLesson",
        href: navHref("enLesson", locale, navOpts),
        label: nav.enLesson,
        active: onEnLesson,
      },
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
      ...(canAccessJpVocabStudy
        ? [
            {
              id: "jpVocabStudy",
              href: navHref("jpVocabStudy", locale, navOpts),
              label: nav.jpVocabStudy,
              active: onJpVocabStudy,
            },
          ]
        : []),
      ...(hasPermission("jp_lesson:read") || hasPermission("jp_lesson:operate")
        ? [
            {
              id: "jpLesson",
              href: navHref("jpLesson", locale, navOpts),
              label: nav.jpLesson,
              active: onJpLessonMain,
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

  if (onHiddenEn && loggedIn && !hasPermission("nav:full")) {
    return [
      ...(onEnVocab
        ? [
            {
              id: "enVocab",
              href: navHref("enVocab", locale, navOpts),
              label: nav.enVocab,
              active: !onEnVocabStudy,
            },
          ]
        : []),
      ...(onEnVocabStudy && canAccessEnVocabStudy
        ? [
            {
              id: "enVocabStudy",
              href: navHref("enVocabStudy", locale, navOpts),
              label: nav.enVocabStudy,
              active: true,
            },
          ]
        : []),
      ...(onEnLesson
        ? [
            {
              id: "enLesson",
              href: navHref("enLesson", locale, navOpts),
              label: nav.enLesson,
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
      ...(onJpVocabStudy && canAccessJpVocabStudy
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
            ...(hasPermission("compare:view") && (!COMPARE_ADMIN_ONLY || isAdmin)
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
                    active: onJpLessonMain,
                  },
                ]
              : []),
            ...(isAdmin
              ? [
                  {
                    id: "jpLessonSchedule",
                    href: navHref("jpLessonSchedule", locale, navOpts),
                    label: nav.jpLessonSchedule,
                    active: onJpLessonSchedule,
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
                  ...(canAccessJpVocabStudy
                    ? [
                        {
                          id: "jpVocabStudy",
                          href: navHref("jpVocabStudy", locale, navOpts),
                          label: nav.jpVocabStudy,
                          active: onJpVocabStudy,
                        },
                      ]
                    : []),
                ]
              : []),
            ...(hasPermission("en_lesson:read") ||
            hasPermission("en_lesson:operate")
              ? [
                  {
                    id: "enLesson",
                    href: navHref("enLesson", locale, navOpts),
                    label: nav.enLesson,
                    active: onEnLesson,
                  },
                ]
              : []),
            ...(hasPermission("en_vocab:read") ||
            hasPermission("en_vocab:operate")
              ? [
                  {
                    id: "enVocab",
                    href: navHref("enVocab", locale, navOpts),
                    label: nav.enVocab,
                    active: onEnVocab && !onEnVocabStudy,
                  },
                  ...(canAccessEnVocabStudy
                    ? [
                        {
                          id: "enVocabStudy",
                          href: navHref("enVocabStudy", locale, navOpts),
                          label: nav.enVocabStudy,
                          active: onEnVocabStudy,
                        },
                      ]
                    : []),
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
