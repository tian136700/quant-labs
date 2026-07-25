"use client";

import { usePathname } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useStoreReviewSubdomain } from "@/hooks/useStoreReviewSubdomain";
import { useI18n } from "@/i18n/I18nProvider";
import {
  isAboutPath,
  isAdminDashboardPath,
  isAdminJpLessonTeachersPath,
  isAdminRbacPath,
  isAdminTrendsPath,
  isAdminToolCodesPath,
  isAdminUsersPath,
  isComparePath,
  isJpLessonPath,
  isJpLessonSchedulePath,
  isJpVocabPath,
  isJpVocabTeacherHomePath,
  isJpVocabAdminPath,
  isJpVocabStudyPath,
  isJpVocabReviewPath,
  isJpVocabCoachPath,
  isEnLessonPath,
  isEnVocabPath,
  isEnVocabTeacherHomePath,
  isEnVocabAdminPath,
  isEnVocabStudyPath,
  isKoPronTeacherHomePath,
  isKoPronAdminPath,
  isKoPronSelectPath,
  isKoPronReviewPath,
  isKoPronStudyPath,
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
  const { user, isAdmin, hasPermission, checking, canAccessJpVocabStudy, canAccessJpVocabTeacherPage, canAccessJpVocabAdminPage, canAccessJpVocabCoach, canAccessEnVocabStudy, canAccessEnVocabTeacherPage, canAccessEnVocabAdminPage, canAccessKoPronTeacherPage, canAccessKoPronAdminPage, canAccessKoPronStudy } = useEtrAuth();
  const loggedIn = Boolean(user);
  const jpTeacherNav =
    loggedIn && hasPermission("nav:jp_teacher") && !hasPermission("nav:full");
  const enTeacherNav =
    loggedIn && hasPermission("nav:en_teacher") && !hasPermission("nav:full");
  const koTeacherNav =
    loggedIn && hasPermission("nav:ko_teacher") && !hasPermission("nav:full");
  const pathname = usePathname() ?? "/";
  const nav = t("nav");
  const onSubdomain = useStoreReviewSubdomain();
  const navOpts = { onSubdomain, isAdmin };
  const showFullNav = !onSubdomain || isAdmin;
  const canViewAbout = hasPermission("about:view");
  const aboutNavItem: SiteNavItem | null = canViewAbout
    ? {
        id: "about",
        href: navHref("about", locale, navOpts),
        label: nav.about,
        active: isAboutPath(pathname),
      }
    : null;
  const onJpLesson = isJpLessonPath(pathname);
  const onJpLessonSchedule = isJpLessonSchedulePath(pathname);
  const onJpLessonMain = onJpLesson && !onJpLessonSchedule;
  const onJpVocab = isJpVocabPath(pathname);
  const onJpVocabTeacherHome = isJpVocabTeacherHomePath(pathname);
  const onJpVocabAdmin = isJpVocabAdminPath(pathname);
  const onJpVocabStudy = isJpVocabStudyPath(pathname);
  const onJpVocabReview = isJpVocabReviewPath(pathname);
  const onJpVocabCoach = isJpVocabCoachPath(pathname);
  const onEnLesson = isEnLessonPath(pathname);
  const onEnVocab = isEnVocabPath(pathname);
  const onEnVocabTeacherHome = isEnVocabTeacherHomePath(pathname);
  const onEnVocabAdmin = isEnVocabAdminPath(pathname);
  const onEnVocabStudy = isEnVocabStudyPath(pathname);
  const onKoPronTeacherHome = isKoPronTeacherHomePath(pathname);
  const onKoPronAdmin = isKoPronAdminPath(pathname);
  const onKoPronSelect = isKoPronSelectPath(pathname);
  const onKoPronReview = isKoPronReviewPath(pathname);
  const onKoPronStudy = isKoPronStudyPath(pathname);
  const onHiddenJp =
    onJpLesson || onJpVocab || onJpVocabStudy || onJpVocabReview || onJpVocabCoach;
  const onHiddenEn = onEnLesson || onEnVocab || onEnVocabStudy;

  if (!loggedIn && !checking) {
    return aboutNavItem ? [aboutNavItem] : [];
  }

  // 英语老师：只保留「英语抽背-老师端」，不挂今日单词 / 新课 / 关于（减负）
  // 多科目（日语+韩语等）取并集，禁止先被 ko/en 单科 early-return 吃掉日语入口
  if (jpTeacherNav || enTeacherNav || koTeacherNav) {
    const items: SiteNavItem[] = [];
    if (jpTeacherNav) {
      if (canAccessJpVocabTeacherPage) {
        items.push({
          id: "jpVocab",
          href: navHref("jpVocab", locale, navOpts),
          label: nav.jpVocab,
          active: onJpVocabTeacherHome,
        });
      }
      if (canAccessJpVocabCoach) {
        items.push({
          id: "jpVocabCoach",
          href: navHref("jpVocabCoach", locale, navOpts),
          label: nav.jpVocabCoach,
          active: onJpVocabCoach,
        });
      }
      if (canAccessJpVocabStudy) {
        items.push({
          id: "jpVocabStudy",
          href: navHref("jpVocabStudy", locale, navOpts),
          label: nav.jpVocabStudy,
          active: onJpVocabStudy,
        });
      }
      if (hasPermission("jp_lesson:read") || hasPermission("jp_lesson:operate")) {
        items.push({
          id: "jpLesson",
          href: navHref("jpLesson", locale, navOpts),
          label: nav.jpLesson,
          active: onJpLessonMain,
        });
      }
    }
    if (enTeacherNav && canAccessEnVocabTeacherPage) {
      items.push({
        id: "enVocab",
        href: navHref("enVocab", locale, navOpts),
        label: nav.enVocab,
        active: onEnVocabTeacherHome,
      });
    }
    if (koTeacherNav && canAccessKoPronTeacherPage) {
      items.push({
        id: "koPron",
        href: navHref("koPron", locale, navOpts),
        label: nav.koPron,
        active: onKoPronTeacherHome,
      });
    }
    if (aboutNavItem) items.push(aboutNavItem);
    return items;
  }

  if (onHiddenEn && loggedIn && !hasPermission("nav:full")) {
    return [
      ...(onEnVocabTeacherHome && canAccessEnVocabTeacherPage
        ? [
            {
              id: "enVocab",
              href: navHref("enVocab", locale, navOpts),
              label: nav.enVocab,
              active: true,
            },
          ]
        : []),
      ...(onEnVocabAdmin && canAccessEnVocabAdminPage
        ? [
            {
              id: "enVocabAdmin",
              href: navHref("enVocabAdmin", locale, navOpts),
              label: nav.enVocabAdmin,
              active: true,
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
      ...(aboutNavItem ? [aboutNavItem] : []),
    ];
  }

  if (onHiddenJp && loggedIn && !hasPermission("nav:full")) {
    const showJpVocabCoach = canAccessJpVocabCoach;
    return [
      ...(onJpVocabTeacherHome && canAccessJpVocabTeacherPage
        ? [
            {
              id: "jpVocab",
              href: navHref("jpVocab", locale, navOpts),
              label: nav.jpVocab,
              active: true,
            },
          ]
        : []),
      ...(onJpVocabAdmin && canAccessJpVocabAdminPage
        ? [
            {
              id: "jpVocabAdmin",
              href: navHref("jpVocabAdmin", locale, navOpts),
              label: nav.jpVocabAdmin,
              active: true,
            },
          ]
        : []),
      ...(showJpVocabCoach
        ? [
            {
              id: "jpVocabCoach",
              href: navHref("jpVocabCoach", locale, navOpts),
              label: nav.jpVocabCoach,
              active: onJpVocabCoach,
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
      ...(onJpVocabReview && isAdmin
        ? [
            {
              id: "jpVocabReview",
              href: navHref("jpVocabReview", locale, navOpts),
              label: nav.jpVocabReview,
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
      ...(aboutNavItem ? [aboutNavItem] : []),
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
                  {
                    id: "adminJpLessonTeachers",
                    href: navHref("adminJpLessonTeachers", locale, navOpts),
                    label: nav.adminJpLessonTeachers,
                    active: isAdminJpLessonTeachersPath(pathname),
                  },
                ]
              : []),
            ...(hasPermission("jp_vocab:teacher") ||
            hasPermission("jp_vocab:admin") ||
            hasPermission("jp_vocab:read") ||
            hasPermission("jp_vocab:operate")
              ? [
                  // 管理员顶栏只进「管理员端」；老师只进「老师端」，避免两个入口抢位
                  ...(canAccessJpVocabAdminPage
                    ? [
                        {
                          id: "jpVocabAdmin",
                          href: navHref("jpVocabAdmin", locale, navOpts),
                          label: nav.jpVocabAdmin,
                          active: onJpVocabAdmin || (isAdmin && onJpVocabTeacherHome),
                        },
                      ]
                    : canAccessJpVocabTeacherPage
                      ? [
                          {
                            id: "jpVocab",
                            href: navHref("jpVocab", locale, navOpts),
                            label: nav.jpVocab,
                            active: onJpVocabTeacherHome,
                          },
                        ]
                      : []),
                  ...(canAccessJpVocabCoach
                    ? [
                        {
                          id: "jpVocabCoach",
                          href: navHref("jpVocabCoach", locale, navOpts),
                          label: nav.jpVocabCoach,
                          active: onJpVocabCoach,
                        },
                      ]
                    : []),
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
                  ...(isAdmin
                    ? [
                        {
                          id: "jpVocabReview",
                          href: navHref("jpVocabReview", locale, navOpts),
                          label: nav.jpVocabReview,
                          active: onJpVocabReview,
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
            ...(hasPermission("en_vocab:teacher") ||
            hasPermission("en_vocab:admin") ||
            hasPermission("en_vocab:read") ||
            hasPermission("en_vocab:operate")
              ? [
                  // 管理员顶栏只进「管理员端」；老师只进「老师端」，避免两个入口抢位
                  ...(canAccessEnVocabAdminPage
                    ? [
                        {
                          id: "enVocabAdmin",
                          href: navHref("enVocabAdmin", locale, navOpts),
                          label: nav.enVocabAdmin,
                          active: onEnVocabAdmin || (isAdmin && onEnVocabTeacherHome),
                        },
                      ]
                    : canAccessEnVocabTeacherPage
                      ? [
                          {
                            id: "enVocab",
                            href: navHref("enVocab", locale, navOpts),
                            label: nav.enVocab,
                            active: onEnVocabTeacherHome,
                          },
                        ]
                      : []),
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
            ...(hasPermission("ko_pron:teacher") ||
            hasPermission("ko_pron:admin") ||
            hasPermission("ko_pron:read") ||
            hasPermission("ko_pron:operate") ||
            hasPermission("ko_pron:study")
              ? [
                  ...(canAccessKoPronAdminPage
                    ? [
                        {
                          id: "koPronSelect",
                          href: navHref("koPronSelect", locale, navOpts),
                          label: nav.koPronSelect,
                          active: onKoPronSelect,
                        },
                        {
                          id: "koPronReview",
                          href: navHref("koPronReview", locale, navOpts),
                          label: nav.koPronReview,
                          active: onKoPronReview,
                        },
                        {
                          id: "koPronAdmin",
                          href: navHref("koPronAdmin", locale, navOpts),
                          label: nav.koPronAdmin,
                          active: onKoPronAdmin || (isAdmin && onKoPronTeacherHome),
                        },
                      ]
                    : canAccessKoPronTeacherPage
                      ? [
                          {
                            id: "koPron",
                            href: navHref("koPron", locale, navOpts),
                            label: nav.koPron,
                            active: onKoPronTeacherHome,
                          },
                        ]
                      : []),
                  ...(canAccessKoPronStudy
                    ? [
                        {
                          id: "koPronStudy",
                          href: navHref("koPronStudy", locale, navOpts),
                          label: nav.koPronStudy,
                          active: onKoPronStudy,
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
      ...(aboutNavItem ? [aboutNavItem] : []),
    ];
  }

  if (onKoPronStudy && loggedIn && canAccessKoPronStudy && !hasPermission("nav:full")) {
    return [
      {
        id: "koPronStudy",
        href: navHref("koPronStudy", locale, navOpts),
        label: nav.koPronStudy,
        active: true,
      },
      ...(aboutNavItem ? [aboutNavItem] : []),
    ];
  }

  return loggedIn
    ? [
        ...(canAccessKoPronStudy
          ? [
              {
                id: "koPronStudy",
                href: navHref("koPronStudy", locale, navOpts),
                label: nav.koPronStudy,
                active: onKoPronStudy,
              },
            ]
          : []),
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
        ...(aboutNavItem ? [aboutNavItem] : []),
      ];
}
