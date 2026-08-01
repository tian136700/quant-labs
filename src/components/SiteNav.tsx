"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useSiteNavSplit } from "@/hooks/useSiteNavSplit";
import { useI18n } from "@/i18n/I18nProvider";
import { MAX_PRIMARY_NAV } from "@/lib/site-nav-config";
import { countFittingPrimaryNavItems } from "@/lib/site-nav-fit";
import type { SiteNavEntry, SiteNavGroupEntry } from "@/lib/site-nav-groups";

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

function SiteNavGroup({
  entry,
  openId,
  setOpenId,
}: {
  entry: SiteNavGroupEntry;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const open = openId === entry.id;
  const menuId = useId();
  const wrapRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpenId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpenId]);

  return (
    <li
      ref={wrapRef}
      className={`admin-nav-group${open ? " is-open" : ""}${
        entry.active ? " is-active" : ""
      }`}
      onMouseEnter={() => setOpenId(entry.id)}
      onMouseLeave={() => setOpenId(null)}
    >
      <button
        type="button"
        className={`admin-nav-link admin-nav-group-trigger${
          entry.active || open ? " is-active" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpenId(open ? null : entry.id)}
      >
        <span>{entry.label}</span>
        <span className="admin-nav-group-caret" aria-hidden>
          ▾
        </span>
      </button>
      <ul
        id={menuId}
        className={`admin-nav-submenu${open ? " is-open" : ""}`}
        role="menu"
        hidden={!open}
      >
        {entry.children.map((child) => (
          <li key={child.id} role="none">
            <Link
              href={child.href}
              role="menuitem"
              prefetch={false}
              className={`admin-nav-submenu-link${
                child.active ? " is-active" : ""
              }`}
              aria-current={child.active ? "page" : undefined}
              onClick={() => setOpenId(null)}
            >
              {child.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

function SiteNavPrimaryEntry({
  entry,
  openId,
  setOpenId,
}: {
  entry: SiteNavEntry;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  if (entry.kind === "group") {
    return (
      <SiteNavGroup entry={entry} openId={openId} setOpenId={setOpenId} />
    );
  }
  return (
    <li>
      <Link
        href={entry.item.href}
        prefetch={false}
        className={`admin-nav-link${entry.active ? " is-active" : ""}`}
        aria-current={entry.active ? "page" : undefined}
      >
        {entry.label}
      </Link>
    </li>
  );
}

export function SiteNav({ drawerOpen, onToggleDrawer }: SiteNavProps) {
  const {
    primaryEntries,
    showMore,
    drawerOnlyActive,
    sortedEntries,
    navRef,
    onMeasured,
  } = useSiteNavSplit();
  const { t } = useI18n();
  const nav = t("nav");
  const rulerRef = useRef<HTMLUListElement>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

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
  }, [sortedEntries, navRef, onMeasured]);

  return (
    <nav ref={navRef} className="admin-nav admin-nav--desktop" aria-label={nav.ariaLabel}>
      {/* Off-flow ruler: nowrap row so each label width is measurable */}
      <ul
        ref={rulerRef}
        className="admin-nav-list admin-nav-list--ruler"
        aria-hidden="true"
      >
        {sortedEntries.map((entry) => (
          <li key={entry.id}>
            <span className="admin-nav-link">
              {entry.kind === "group" ? (
                <>
                  <span>{entry.label}</span>
                  <span className="admin-nav-group-caret" aria-hidden>
                    ▾
                  </span>
                </>
              ) : (
                entry.label
              )}
            </span>
          </li>
        ))}
        <li>
          <span className="admin-nav-link admin-nav-more">{nav.more}</span>
        </li>
      </ul>

      {/* Visible nav */}
      <ul className="admin-nav-list">
        {primaryEntries.map((entry) => (
          <SiteNavPrimaryEntry
            key={entry.id}
            entry={entry}
            openId={openGroupId}
            setOpenId={setOpenGroupId}
          />
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
