"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  PINNED_PRIMARY_NAV_ID,
  PRIMARY_NAV_ORDER,
} from "@/lib/site-nav-config";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";
import { useNavPreferences } from "@/contexts/NavPreferencesProvider";

/**
 * Leftmost: pinned「日语抽问-管理员端」when present.
 * Then: visit frequency (desc). Equal counts → PRIMARY_NAV_ORDER.
 * Do NOT put the current page first — that would steal the pinned slot.
 */
function sortNavItems(
  items: SiteNavItem[],
  counts: Record<string, number>
): SiteNavItem[] {
  const orderMap = new Map<string, number>(
    PRIMARY_NAV_ORDER.map((id, i) => [id, i])
  );
  const pinned = items.filter((item) => item.id === PINNED_PRIMARY_NAV_ID);
  const rest = items.filter((item) => item.id !== PINNED_PRIMARY_NAV_ID);
  rest.sort((a, b) => {
    const countDiff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
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
  sortedItems: SiteNavItem[],
  maxVisible: number
): { primaryItems: SiteNavItem[]; drawerOnlyItems: SiteNavItem[] } {
  const capped = Math.max(1, Math.min(maxVisible, sortedItems.length));
  const pinned = sortedItems.find((item) => item.id === PINNED_PRIMARY_NAV_ID);
  const rest = sortedItems.filter((item) => item.id !== PINNED_PRIMARY_NAV_ID);

  if (pinned) {
    const slotsForRest = Math.max(0, capped - 1);
    const activeRest = rest.filter((item) => item.active);
    const inactiveRest = rest.filter((item) => !item.active);
    // Active first among non-pinned so current page stays on the bar
    const orderedRest = [...activeRest, ...inactiveRest];
    const visibleRestCount = Math.max(slotsForRest, activeRest.length);
    const visibleRest = orderedRest.slice(
      0,
      Math.min(visibleRestCount, orderedRest.length)
    );
    const primaryItems = [pinned, ...visibleRest];
    const primaryIds = new Set(primaryItems.map((item) => item.id));
    const drawerOnlyItems = sortedItems.filter(
      (item) => !primaryIds.has(item.id)
    );
    return { primaryItems, drawerOnlyItems };
  }

  const active = sortedItems.filter((item) => item.active);
  const inactive = sortedItems.filter((item) => !item.active);
  const ordered = [...active, ...inactive];
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
    () => sortNavItems(allItems, visitCounts),
    [allItems, visitCounts]
  );

  const onMeasured = useCallback((count: number) => {
    setMaxVisible((prev) => (prev === count ? prev : count));
  }, []);

  const result = useMemo(() => {
    const { primaryItems, drawerOnlyItems } = splitPrimaryAndDrawer(
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
