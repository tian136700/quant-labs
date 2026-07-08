"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRIMARY_NAV_ORDER } from "@/lib/site-nav-config";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";
import { useNavPreferences } from "@/hooks/useNavPreferences";

/**
 * Sort items by visit frequency (descending).
 * Items with the same count preserve the default PRIMARY_NAV_ORDER hint.
 */
function sortByFrequency(
  items: SiteNavItem[],
  counts: Record<string, number>
): SiteNavItem[] {
  const orderMap = new Map<string, number>(
    PRIMARY_NAV_ORDER.map((id, i) => [id, i])
  );
  return [...items].sort((a, b) => {
    const countDiff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
    if (countDiff !== 0) return countDiff;
    const aOrder = orderMap.get(a.id) ?? 999;
    const bOrder = orderMap.get(b.id) ?? 999;
    return aOrder - bOrder;
  });
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
    const capped = Math.min(maxVisible, sortedItems.length);
    const primaryItems = sortedItems.slice(0, capped);
    const drawerOnlyItems = sortedItems.slice(capped);
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
