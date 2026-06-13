"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useStoreReviewSubdomain } from "@/hooks/useStoreReviewSubdomain";
import { useI18n } from "@/i18n/I18nProvider";
import {
  isAboutPath,
  isAdminPath,
  isComparePath,
  isStoreReviewHomePath,
  isStoreReviewPlazaPath,
  isTeacherReviewPath,
} from "@/lib/locale-path";
import { navHref } from "@/lib/nav-href";

export function SiteNav() {
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const nav = t("nav");
  const onSubdomain = useStoreReviewSubdomain();
  const navOpts = { onSubdomain, isAdmin };
  const showFullNav = !onSubdomain || isAdmin;

  const items = showFullNav
    ? [
        ...(checking || !isAdmin
          ? []
          : [
              {
                href: navHref("compare", locale, navOpts),
                label: nav.strategyCompare,
                active: isComparePath(pathname),
              },
              {
                href: navHref("teacherReview", locale, navOpts),
                label: nav.teacherReview,
                active: isTeacherReviewPath(pathname),
              },
              {
                href: navHref("admin", locale, navOpts),
                label: nav.adminDashboard,
                active: isAdminPath(pathname),
              },
            ]),
        {
          href: navHref("storeReview", locale, navOpts),
          label: nav.storeReview,
          active: isStoreReviewHomePath(pathname),
        },
        {
          href: navHref("about", locale, navOpts),
          label: nav.about,
          active: isAboutPath(pathname),
        },
      ]
    : [
        {
          href: navHref("storeReview", locale, navOpts),
          label: nav.storeReview,
          active: isStoreReviewHomePath(pathname),
        },
        {
          href: navHref("storeReviewPlaza", locale, navOpts),
          label: t("storeReview").plaza.title,
          active: isStoreReviewPlazaPath(pathname),
        },
      ];

  return (
    <nav className="admin-nav" aria-label={nav.ariaLabel}>
      <ul className="admin-nav-list">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`admin-nav-link${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
