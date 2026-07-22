"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSiteNavSplit } from "@/hooks/useSiteNavSplit";
import { useI18n } from "@/i18n/I18nProvider";
import { MAX_PRIMARY_NAV } from "@/lib/site-nav-config";
import { countFittingPrimaryNavItems } from "@/lib/site-nav-fit";

type SiteNavProps = {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
};

function readFlexGapPx(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const raw = style.columnGap || style.gap || "0";
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SiteNav({ drawerOpen, onToggleDrawer }: SiteNavProps) {
  const { primaryItems, showMore, drawerOnlyActive, sortedItems, navRef, onMeasured } =
    useSiteNavSplit();
  const { t } = useI18n();
  const nav = t("nav");
  const rulerRef = useRef<HTMLUListElement>(null);

  // Width-sum measure: keep「更多」fully visible (not clipped to「更」)
  useEffect(() => {
    const ruler = rulerRef.current;
    const navEl = navRef.current;
    if (!ruler || !navEl) return;

    const doMeasure = () => {
      const children = Array.from(ruler.children) as HTMLElement[];
      if (children.length < 2) return;
      const moreEl = children[children.length - 1]!;
      const itemEls = children.slice(0, -1);
      const gap = readFlexGapPx(ruler);
      const available = navEl.clientWidth;
      if (available <= 0) return;

      const itemWidths = itemEls.map((el) => el.getBoundingClientRect().width);
      const moreWidth = moreEl.getBoundingClientRect().width;
      onMeasured(
        countFittingPrimaryNavItems(
          itemWidths,
          moreWidth,
          gap,
          available,
          MAX_PRIMARY_NAV
        )
      );
    };

    doMeasure();
    const observer = new ResizeObserver(doMeasure);
    observer.observe(navEl);
    return () => observer.disconnect();
  }, [sortedItems, navRef, onMeasured]);

  return (
    <nav ref={navRef} className="admin-nav admin-nav--desktop" aria-label={nav.ariaLabel}>
      {/* Off-flow ruler: nowrap row so each label width is measurable */}
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
          <span className="admin-nav-link admin-nav-more">{nav.more}</span>
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
          <li className="admin-nav-more-slot">
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
