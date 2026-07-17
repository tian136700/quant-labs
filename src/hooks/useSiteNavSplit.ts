"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIMARY_NAV_ORDER } from "@/lib/site-nav-config";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";
import { useNavPreferences } from "@/contexts/NavPreferencesProvider";

/**
 * Sort items by visit frequency (descending).
 * Items with the same count preserve the default PRIMARY_NAV_ORDER hint.
 * Current page always comes first so the top bar shows where you are.
 */
function sortByFrequency(
  items: SiteNavItem[],
  counts: Record<string, number>
): SiteNavItem[] {
  const orderMap = new Map<string, number>(
    PRIMARY_NAV_ORDER.map((id, i) => [id, i])
  );
  return [...items].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const countDiff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
    if (countDiff !== 0) return countDiff;
    const aOrder = orderMap.get(a.id) ?? 999;
    const bOrder = orderMap.get(b.id) ?? 999;
    return aOrder - bOrder;
  });
}

/** Ensure active page is always among the visible top-bar slots (leftmost). */
function pinActiveIntoPrimary(
  sortedItems: SiteNavItem[],
  maxVisible: number
): { primaryItems: SiteNavItem[]; drawerOnlyItems: SiteNavItem[] } {
  const capped = Math.max(1, Math.min(maxVisible, sortedItems.length));
  const active = sortedItems.filter((item) => item.active);
  const rest = sortedItems.filter((item) => !item.active);
  const ordered = [...active, ...rest];
  // Keep at least every active item visible even if that shrinks other slots
  const visibleCount = Math.max(capped, active.length);
  const primaryItems = ordered.slice(0, Math.min(visibleCount, ordered.length));
  const primaryIds = new Set(primaryItems.map((item) => item.id));
  const drawerOnlyItems = ordered.filter((item) => !primaryIds.has(item.id));
  return { primaryItems, drawerOnlyItems };
}

export function useSiteNavSplit(): {
  allItems: SiteNavItem[];
  primaryItems: SiteNavItem[];
  drawerOnlyItems: SiteNavItem[];
  showMore: boolean;
  drawerOnlyActive: boolean;
  sortedItems: SiteNavItem[];
  navRef: React.RefObject<HTMLElement | null>;
  maxVisible: number;
  onMeasured: (count: number) => void;
} {
  const allItems = useSiteNavItems();
  const { visitCounts } = useNavPreferences();
  const navRef = useRef<HTMLElement | null>(null);
  const [maxVisible, setMaxVisible] = useState<number>(allItems.length);

  const sortedItems = useMemo(
    () => sortByFrequency(allItems, visitCounts),
    [allItems, visitCounts]
  );

  const onMeasured = useCallback((count: number) => {
    setMaxVisible((prev) => (prev === count ? prev : count));
  }, []);

  const result = useMemo(() => {
    const { primaryItems, drawerOnlyItems } = pinActiveIntoPrimary(
      sortedItems,
      maxVisible
    );
    const showMore = drawerOnlyItems.length > 0;
    const drawerOnlyActive = drawerOnlyItems.some((item) => item.active);

    return {
      allItems,
      primaryItems,
      drawerOnlyItems,
      showMore,
      drawerOnlyActive,
      sortedItems,
      navRef,
      maxVisible,
      onMeasured,
    };
  }, [allItems, sortedItems, maxVisible, onMeasured]);

  return result;
}
