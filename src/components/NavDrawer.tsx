"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { SiteAuthBar } from "@/components/SiteAuthBar";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";
import { useI18n } from "@/i18n/I18nProvider";
import { matchesNavSearch } from "@/lib/nav-search";
import { isJpModulePath } from "@/lib/locale-path";
import {
  NAV_CATEGORY_ORDER,
  PRIMARY_NAV_ORDER,
  navItemCategory,
  type NavCategory,
} from "@/lib/site-nav-config";

type NavDrawerProps = {
  id: string;
  open: boolean;
  onClose: () => void;
  showTools?: boolean;
};

const CATEGORY_ICONS: Record<NavCategory, string> = {
  teaching: "📚",
  admin: "⚙",
  ai: "🤖",
  data: "📊",
  system: "📅",
};

function NavDrawerLink({
  item,
  isFavorite,
  onToggleFavorite,
  onNavigate,
  favoriteAddLabel,
  favoriteRemoveLabel,
}: {
  item: SiteNavItem;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onNavigate: () => void;
  favoriteAddLabel: string;
  favoriteRemoveLabel: string;
}) {
  return (
    <li className="nav-drawer-item">
      <Link
        href={item.href}
        className={`nav-drawer-link${item.active ? " is-active" : ""}`}
        aria-current={item.active ? "page" : undefined}
        onClick={onNavigate}
      >
        <span className="nav-drawer-link-label">{item.label}</span>
      </Link>
      <button
        type="button"
        className={`nav-drawer-fav${isFavorite ? " is-fav" : ""}`}
        aria-label={isFavorite ? favoriteRemoveLabel : favoriteAddLabel}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(item.id);
        }}
      >
        ⭐
      </button>
    </li>
  );
}

function NavDrawerSection({
  title,
  items,
  favorites,
  onToggleFavorite,
  onNavigate,
  favoriteAddLabel,
  favoriteRemoveLabel,
}: {
  title: string;
  items: SiteNavItem[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onNavigate: (item: SiteNavItem) => void;
  favoriteAddLabel: string;
  favoriteRemoveLabel: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="nav-drawer-section">
      <h3 className="nav-drawer-section-title">{title}</h3>
      <ul className="nav-drawer-list">
        {items.map((item) => (
          <NavDrawerLink
            key={item.id}
            item={item}
            isFavorite={favorites.has(item.id)}
            onToggleFavorite={onToggleFavorite}
            onNavigate={() => onNavigate(item)}
            favoriteAddLabel={favoriteAddLabel}
            favoriteRemoveLabel={favoriteRemoveLabel}
          />
        ))}
      </ul>
    </section>
  );
}

export function NavDrawer({
  id,
  open,
  onClose,
  showTools = false,
}: NavDrawerProps) {
  const pathname = usePathname() ?? "/";
  const onJpModule = isJpModulePath(pathname);
  const items = useSiteNavItems();
  const { t } = useI18n();
  const nav = t("nav");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { recent, favorites, visitCounts, recordVisit, toggleFavorite } =
    useNavPreferences();

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const activeItemId = items.find((item) => item.active)?.id;

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (activeItemId) recordVisit(activeItemId);
  }, [activeItemId, recordVisit]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => searchRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesNavSearch(item.label, query)),
    [items, query]
  );

  const favoriteItems = useMemo(
    () =>
      favorites
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is SiteNavItem => Boolean(item))
        .filter((item) => matchesNavSearch(item.label, query)),
    [favorites, items, query]
  );

  const recentItems = useMemo(
    () =>
      recent
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is SiteNavItem => Boolean(item))
        .filter((item) => matchesNavSearch(item.label, query)),
    [recent, items, query]
  );

  const searching = query.trim().length > 0;
  const showRecents = !searching && recentItems.length > 0;
  const showFavorites = !searching && favoriteItems.length > 0;

  const pinnedIds = useMemo(() => {
    const ids = new Set<string>();
    if (showFavorites) favoriteItems.forEach((item) => ids.add(item.id));
    if (showRecents) recentItems.forEach((item) => ids.add(item.id));
    return ids;
  }, [showFavorites, showRecents, favoriteItems, recentItems]);

  const categorizedVisible = useMemo(() => {
    const orderMap = new Map<string, number>(
      PRIMARY_NAV_ORDER.map((id, i) => [id, i])
    );
    const groups = new Map<NavCategory, SiteNavItem[]>();
    for (const cat of NAV_CATEGORY_ORDER) groups.set(cat, []);
    for (const item of filteredItems) {
      if (pinnedIds.has(item.id)) continue;
      const cat = navItemCategory(item.id);
      groups.get(cat)?.push(item);
    }
    // Sort each category by frequency descending (least used last)
    for (const [, items] of groups) {
      items.sort((a, b) => {
        const countDiff = (visitCounts[b.id] ?? 0) - (visitCounts[a.id] ?? 0);
        if (countDiff !== 0) return countDiff;
        const aOrder = orderMap.get(a.id) ?? 999;
        const bOrder = orderMap.get(b.id) ?? 999;
        return aOrder - bOrder;
      });
    }
    return groups;
  }, [filteredItems, pinnedIds, visitCounts]);

  const handleNavigate = useCallback(
    (item: SiteNavItem) => {
      recordVisit(item.id);
      onClose();
    },
    [onClose, recordVisit]
  );

  return (
    <>
      <button
        type="button"
        className={`nav-drawer-backdrop${open ? " is-open" : ""}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        aria-label={nav.closeMenu}
        onClick={onClose}
      />
      <aside
        id={id}
        className={`nav-drawer${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label={nav.allFeatures}
      >
        <div className="nav-drawer-head">
          <span className="nav-drawer-title">{nav.allFeatures}</span>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label={nav.closeMenu}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="nav-drawer-search-wrap">
          <input
            ref={searchRef}
            type="search"
            className="nav-drawer-search"
            placeholder={nav.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={nav.searchPlaceholder}
          />
        </div>

        {showTools ? (
          <div className="nav-drawer-tools">
            <SiteAuthBar />
            {onJpModule ? null : <LangSwitch />}
          </div>
        ) : null}

        <div className="nav-drawer-body">
          {showFavorites ? (
            <NavDrawerSection
              title={`⭐ ${nav.favorites}`}
              items={favoriteItems}
              favorites={favoritesSet}
              onToggleFavorite={toggleFavorite}
              onNavigate={handleNavigate}
              favoriteAddLabel={nav.favoriteAdd}
              favoriteRemoveLabel={nav.favoriteRemove}
            />
          ) : null}

          {showRecents ? (
            <NavDrawerSection
              title={`⭐ ${nav.recent}`}
              items={recentItems}
              favorites={favoritesSet}
              onToggleFavorite={toggleFavorite}
              onNavigate={handleNavigate}
              favoriteAddLabel={nav.favoriteAdd}
              favoriteRemoveLabel={nav.favoriteRemove}
            />
          ) : null}

          {searching ? (
            filteredItems.length > 0 ? (
              <NavDrawerSection
                title={nav.searchResults}
                items={filteredItems}
                favorites={favoritesSet}
                onToggleFavorite={toggleFavorite}
                onNavigate={handleNavigate}
                favoriteAddLabel={nav.favoriteAdd}
                favoriteRemoveLabel={nav.favoriteRemove}
              />
            ) : (
              <p className="nav-drawer-empty">{nav.noResults}</p>
            )
          ) : (
            NAV_CATEGORY_ORDER.map((cat) => {
              const catItems = categorizedVisible.get(cat) ?? [];
              if (catItems.length === 0) return null;
              const icon = CATEGORY_ICONS[cat];
              const label = nav.categories[cat];
              return (
                <NavDrawerSection
                  key={cat}
                  title={`${icon} ${label}`}
                  items={catItems}
                  favorites={favoritesSet}
                  onToggleFavorite={toggleFavorite}
                  onNavigate={handleNavigate}
                  favoriteAddLabel={nav.favoriteAdd}
                  favoriteRemoveLabel={nav.favoriteRemove}
                />
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
