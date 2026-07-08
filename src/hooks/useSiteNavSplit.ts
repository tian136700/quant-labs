"use client";

import { useMemo } from "react";
import {
  MAX_PRIMARY_NAV,
  PRIMARY_NAV_ORDER,
} from "@/lib/site-nav-config";
import { useSiteNavItems, type SiteNavItem } from "@/hooks/useSiteNavItems";

export function useSiteNavSplit(): {
  allItems: SiteNavItem[];
  primaryItems: SiteNavItem[];
  drawerOnlyItems: SiteNavItem[];
  showMore: boolean;
  drawerOnlyActive: boolean;
} {
  const allItems = useSiteNavItems();

  return useMemo(() => {
    const byId = new Map(allItems.map((item) => [item.id, item]));
    const primaryItems: SiteNavItem[] = [];

    for (const id of PRIMARY_NAV_ORDER) {
      if (primaryItems.length >= MAX_PRIMARY_NAV) break;
      const item = byId.get(id);
      if (item) primaryItems.push(item);
    }

    const primaryIds = new Set(primaryItems.map((item) => item.id));
    const drawerOnlyItems = allItems.filter((item) => !primaryIds.has(item.id));
    const showMore = drawerOnlyItems.length > 0;
    const drawerOnlyActive = drawerOnlyItems.some((item) => item.active);

    return {
      allItems,
      primaryItems,
      drawerOnlyItems,
      showMore,
      drawerOnlyActive,
    };
  }, [allItems]);
}
