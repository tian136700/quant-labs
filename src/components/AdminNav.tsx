"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  comparePath,
  isComparePath,
  isTeacherReviewPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";

export function AdminNav() {
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const pathname = usePathname() ?? "/";
  const nav = t("nav");

  if (checking || !isAdmin) return null;

  const items = [
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
