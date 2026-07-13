"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSiteNavSplit } from "@/hooks/useSiteNavSplit";
import { useI18n } from "@/i18n/I18nProvider";

type SiteNavProps = {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
};

export function SiteNav({ drawerOpen, onToggleDrawer }: SiteNavProps) {
  const { primaryItems, showMore, drawerOnlyActive, sortedItems, navRef, onMeasured } =
    useSiteNavSplit();
  const { t } = useI18n();
  const nav = t("nav");
  const rulerRef = useRef<HTMLUListElement>(null);

  // Measure how many items fit in one row
  useEffect(() => {
    const ruler = rulerRef.current;
    const navEl = navRef.current;
    if (!ruler || !navEl) return;

    const doMeasure = () => {
      const children = Array.from(ruler.children) as HTMLElement[];
      if (children.length === 0) return;
      const firstTop = children[0].getBoundingClientRect().top;
      let fitCount = 0;
      for (const child of children) {
        if (Math.abs(child.getBoundingClientRect().top - firstTop) < 4) {
          fitCount++;
        } else {
          break;
        }
      }
      // Reserve 1 slot for "more" button if overflow
      const total = sortedItems.length;
      if (fitCount < total) {
        onMeasured(Math.max(fitCount - 1, 1));
      } else {
        onMeasured(total);
      }
    };

    doMeasure();
    const observer = new ResizeObserver(doMeasure);
    observer.observe(navEl);
    return () => observer.disconnect();
  }, [sortedItems, navRef, onMeasured]);

  return (
    <nav ref={navRef} className="admin-nav admin-nav--desktop" aria-label={nav.ariaLabel}>
      {/* Hidden ruler: renders all items with wrap to measure what fits */}
      <ul
        ref={rulerRef}
        className="admin-nav-list admin-nav-list--ruler"
        aria-hidden="true"
      >
        {sortedItems.map((item) => (
          <li key={item.id}>
            <span className="admin-nav-link">{item.label}</span>
          </li>
        ))}
        <li>
          <span className="admin-nav-link">{nav.more}</span>
        </li>
      </ul>

      {/* Visible nav */}
      <ul className="admin-nav-list">
        {primaryItems.map((item) => (
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
