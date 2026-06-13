"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useStoreReviewSubdomain } from "@/hooks/useStoreReviewSubdomain";
import { useI18n } from "@/i18n/I18nProvider";
import {
  aboutPath,
  adminPath,
  comparePath,
  isAboutPath,
  isAdminPath,
  isComparePath,
  isStoreReviewHomePath,
  isStoreReviewPlazaPath,
  isTeacherReviewPath,
  storeReviewPath,
  storeReviewPlazaPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";

export function SiteNav() {
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const nav = t("nav");
  const onSubdomain = useStoreReviewSubdomain();

  const items = onSubdomain
    ? [
        {
          href: storeReviewPath(locale),
          label: nav.storeReview,
          active: isStoreReviewHomePath(pathname),
        },
        {
          href: storeReviewPlazaPath(locale),
          label: t("storeReview").plaza.title,
          active: isStoreReviewPlazaPath(pathname),
        },
      ]
    : [
        ...(checking || !isAdmin
          ? []
          : [
              {
                href: comparePath(locale),
                label: nav.strategyCompare,
                active: isComparePath(pathname),
              },
              {
                href: teacherReviewNavPath(locale),
                label: nav.teacherReview,
                active: isTeacherReviewPath(pathname),
              },
              {
                href: adminPath(locale),
                label: nav.adminDashboard,
                active: isAdminPath(pathname),
              },
            ]),
        {
          href: storeReviewPath(locale),
          label: nav.storeReview,
          active: isStoreReviewHomePath(pathname),
        },
        {
          href: aboutPath(locale),
          label: nav.about,
          active: isAboutPath(pathname),
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
