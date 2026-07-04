"use client";

import Link from "next/link";
import { useSiteNavItems } from "@/hooks/useSiteNavItems";
import { useI18n } from "@/i18n/I18nProvider";

export function SiteNav() {
  const items = useSiteNavItems();
  const { t } = useI18n();
  const nav = t("nav");

  return (
    <nav className="admin-nav admin-nav--desktop" aria-label={nav.ariaLabel}>
      <ul className="admin-nav-list">
        {items.map((item) => (
          <li key={item.id}>
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
