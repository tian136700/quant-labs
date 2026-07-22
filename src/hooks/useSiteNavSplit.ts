"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  MAX_PRIMARY_NAV,
  PINNED_PRIMARY_NAV_ID,
  PRIMARY_NAV_ORDER,
} from "@/lib/site-nav-config";
import {
  groupSiteNavItems,
  siteNavEntryVisitCount,
  type SiteNavEntry,
} from "@/lib/site-nav-groups";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";
import { useNavPreferences } from "@/contexts/NavPreferencesProvider";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Leftmost: pinned「日语」group when present.
 * Then: visit frequency (desc). Equal counts → PRIMARY_NAV_ORDER.
 * Do NOT put the current page first — that would steal the pinned slot.
 */
function sortNavEntries(
  entries: SiteNavEntry[],
  counts: Record<string, number>
): SiteNavEntry[] {
  const orderMap = new Map<string, number>(
    PRIMARY_NAV_ORDER.map((id, i) => [id, i])
  );
  const pinned = entries.filter((e) => e.id === PINNED_PRIMARY_NAV_ID);
  const rest = entries.filter((e) => e.id !== PINNED_PRIMARY_NAV_ID);
  rest.sort((a, b) => {
    const countDiff =
      siteNavEntryVisitCount(b, counts) - siteNavEntryVisitCount(a, counts);
    if (countDiff !== 0) return countDiff;
    const aOrder = orderMap.get(a.id) ?? 999;
    const bOrder = orderMap.get(b.id) ?? 999;
    return aOrder - bOrder;
  });
  return [...pinned, ...rest];
}

/**
 * Split into top-bar vs「更多」.
 * Keep pinned item at index 0; ensure active page stays in the visible strip
 * (may expand beyond maxVisible if needed), without moving it ahead of pinned.
 */
function splitPrimaryAndDrawer(
  sortedEntries: SiteNavEntry[],
  maxVisible: number
): { primaryEntries: SiteNavEntry[]; drawerOnlyEntries: SiteNavEntry[] } {
  const capped = Math.max(1, Math.min(maxVisible, sortedEntries.length));
  const pinned = sortedEntries.find((e) => e.id === PINNED_PRIMARY_NAV_ID);
  const rest = sortedEntries.filter((e) => e.id !== PINNED_PRIMARY_NAV_ID);

  if (pinned) {
    const slotsForRest = Math.max(0, capped - 1);
    const activeRest = rest.filter((e) => e.active);
    const inactiveRest = rest.filter((e) => !e.active);
    const orderedRest = [...activeRest, ...inactiveRest];
    const visibleRestCount = Math.max(slotsForRest, activeRest.length);
    const visibleRest = orderedRest.slice(
      0,
      Math.min(visibleRestCount, orderedRest.length)
    );
    const primaryEntries = [pinned, ...visibleRest];
    const primaryIds = new Set(primaryEntries.map((e) => e.id));
    const drawerOnlyEntries = sortedEntries.filter(
      (e) => !primaryIds.has(e.id)
    );
    return { primaryEntries, drawerOnlyEntries };
  }

  const active = sortedEntries.filter((e) => e.active);
  const inactive = sortedEntries.filter((e) => !e.active);
  const ordered = [...active, ...inactive];
  const visibleCount = Math.max(capped, active.length);
  const primaryEntries = ordered.slice(0, Math.min(visibleCount, ordered.length));
  const primaryIds = new Set(primaryEntries.map((e) => e.id));
  const drawerOnlyEntries = ordered.filter((e) => !primaryIds.has(e.id));
  return { primaryEntries, drawerOnlyEntries };
}

export function useSiteNavSplit(): {
  allItems: SiteNavItem[];
  primaryEntries: SiteNavEntry[];
  drawerOnlyEntries: SiteNavEntry[];
  /** @deprecated use primaryEntries; kept for callers that need flat primary leaves */
  primaryItems: SiteNavItem[];
  drawerOnlyItems: SiteNavItem[];
  showMore: boolean;
  drawerOnlyActive: boolean;
  sortedEntries: SiteNavEntry[];
  sortedItems: SiteNavItem[];
  navRef: React.RefObject<HTMLElement | null>;
  maxVisible: number;
  onMeasured: (count: number) => void;
} {
  const allItems = useSiteNavItems();
  const { isAdmin } = useEtrAuth();
  const { visitCounts } = useNavPreferences();
  const { t } = useI18n();
  const nav = t("nav");
  const navRef = useRef<HTMLElement | null>(null);
  const [maxVisible, setMaxVisible] = useState<number>(() =>
    Math.min(allItems.length, MAX_PRIMARY_NAV)
  );

  // Admin: language secondary menus (many leaves). Others: flat primary links.
  const groupedEntries = useMemo(
    () =>
      groupSiteNavItems(
        allItems,
        {
          langJp: nav.langJp,
          langEn: nav.langEn,
          langKo: nav.langKo,
        },
        { useLangGroups: isAdmin }
      ),
    [allItems, isAdmin, nav.langJp, nav.langEn, nav.langKo]
  );

  const sortedEntries = useMemo(
    () => sortNavEntries(groupedEntries, visitCounts),
    [groupedEntries, visitCounts]
  );

  const onMeasured = useCallback((count: number) => {
    const capped = Math.max(1, Math.min(count, MAX_PRIMARY_NAV));
    setMaxVisible((prev) => (prev === capped ? prev : capped));
  }, []);

  const result = useMemo(() => {
    const { primaryEntries, drawerOnlyEntries } = splitPrimaryAndDrawer(
      sortedEntries,
      Math.min(maxVisible, MAX_PRIMARY_NAV)
    );
    const showMore = drawerOnlyEntries.length > 0;
    const drawerOnlyActive = drawerOnlyEntries.some((e) => e.active);

    const flattenLeaves = (entries: SiteNavEntry[]): SiteNavItem[] =>
      entries.flatMap((e) => (e.kind === "group" ? e.children : [e.item]));

    return {
      allItems,
      primaryEntries,
      drawerOnlyEntries,
      primaryItems: flattenLeaves(primaryEntries),
      drawerOnlyItems: flattenLeaves(drawerOnlyEntries),
      showMore,
      drawerOnlyActive,
      sortedEntries,
      sortedItems: allItems,
      navRef,
      maxVisible,
      onMeasured,
    };
  }, [allItems, sortedEntries, maxVisible, onMeasured]);

  return result;
}
