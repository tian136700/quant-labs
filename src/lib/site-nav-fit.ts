/**
 * How many primary nav labels fit in one row while keeping「更多」fully visible.
 * Pure width math — used by SiteNav measurement (and regression checks).
 */
export function countFittingPrimaryNavItems(
  itemWidths: number[],
  moreWidth: number,
  gap: number,
  availableWidth: number,
  hardCap: number
): number {
  const n = itemWidths.length;
  if (n === 0) return 0;
  const cap = Math.max(1, Math.min(hardCap, n));

  let totalAll = 0;
  for (let i = 0; i < n; i++) {
    totalAll += itemWidths[i]! + (i > 0 ? gap : 0);
  }
  // Everything fits and under the product cap → no「更多」needed
  if (totalAll <= availableWidth + 0.5 && n <= hardCap) {
    return n;
  }

  // Reserve room for「更多」whenever at least one item goes to the drawer
  let used = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (count >= cap) break;
    const next = used + (count > 0 ? gap : 0) + itemWidths[i]!;
    const withMore = next + gap + moreWidth;
    if (withMore <= availableWidth + 0.5) {
      used = next;
      count = i + 1;
    } else {
      break;
    }
  }
  return Math.max(1, Math.min(count, cap));
}
