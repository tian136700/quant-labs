"use client";

import Link from "next/link";
import { useSiteNavSplit } from "@/hooks/useSiteNavSplit";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { useI18n } from "@/i18n/I18nProvider";

type SiteNavProps = {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
};

export function SiteNav({ drawerOpen, onToggleDrawer }: SiteNavProps) {
  const { primaryItems, showMore, drawerOnlyActive } = useSiteNavSplit();
  const { recordVisit } = useNavPreferences();
  const { t } = useI18n();
  const nav = t("nav");

  return (
    <nav className="admin-nav admin-nav--desktop" aria-label={nav.ariaLabel}>
      <ul className="admin-nav-list">
        {primaryItems.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`admin-nav-link${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
              onClick={() => recordVisit(item.id)}
            >
              {item.label}
            </Link>
          </li>
        ))}
        {showMore ? (
          <li>
            <button
              type="button"
              className={`admin-nav-link admin-nav-more${
                drawerOpen || drawerOnlyActive ? " is-active" : ""
              }`}
              aria-expanded={drawerOpen}
              aria-controls="site-nav-drawer"
              onClick={onToggleDrawer}
            >
              {nav.more}
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
