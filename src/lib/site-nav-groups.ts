import {
  NAV_LANG_GROUPS,
  NAV_LEAF_LANG_GROUP,
  type NavLangGroupId,
} from "@/lib/site-nav-config";
import type { SiteNavItem } from "@/hooks/useSiteNavItems";

export type SiteNavLinkEntry = {
  kind: "link";
  id: string;
  label: string;
  active: boolean;
  item: SiteNavItem;
};

export type SiteNavGroupEntry = {
  kind: "group";
  id: NavLangGroupId;
  label: string;
  active: boolean;
  children: SiteNavItem[];
};

export type SiteNavEntry = SiteNavLinkEntry | SiteNavGroupEntry;

export type SiteNavGroupLabels = Record<NavLangGroupId, string>;

/**
 * Collapse flat leaf nav items into language groups + remaining flat links.
 * Groups with zero visible children are omitted.
 *
 * Language secondary menus are **admin-only** (too many leaves). Teachers and
 * other roles keep a flat primary list — they typically have only 1–2 items.
 */
export function groupSiteNavItems(
  flatItems: SiteNavItem[],
  labels: SiteNavGroupLabels,
  opts?: { useLangGroups?: boolean }
): SiteNavEntry[] {
  if (opts?.useLangGroups === false) {
    return flatItems.map((item) => ({
      kind: "link" as const,
      id: item.id,
      label: item.label,
      active: item.active,
      item,
    }));
  }

  const byId = new Map(flatItems.map((item) => [item.id, item]));
  const consumed = new Set<string>();
  const entries: SiteNavEntry[] = [];

  for (const group of NAV_LANG_GROUPS) {
    const children: SiteNavItem[] = [];
    for (const childId of group.childIds) {
      const item = byId.get(childId);
      if (!item) continue;
      children.push(item);
      consumed.add(childId);
    }
    if (children.length === 0) continue;
    entries.push({
      kind: "group",
      id: group.id,
      label: labels[group.id],
      active: children.some((c) => c.active),
      children,
    });
  }

  for (const item of flatItems) {
    if (consumed.has(item.id)) continue;
    // Safety: any leaf that maps to a lang group but wasn't in childIds still skip
    if (NAV_LEAF_LANG_GROUP[item.id]) continue;
    entries.push({
      kind: "link",
      id: item.id,
      label: item.label,
      active: item.active,
      item,
    });
  }

  return entries;
}

/** Visit score for sorting: groups sum child visits; links use their own. */
export function siteNavEntryVisitCount(
  entry: SiteNavEntry,
  counts: Record<string, number>
): number {
  if (entry.kind === "link") return counts[entry.id] ?? 0;
  let sum = 0;
  for (const child of entry.children) {
    sum += counts[child.id] ?? 0;
  }
  return sum;
}
