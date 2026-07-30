/**
 * 英语补全 list_missing：按当日序号（日序）优先。
 * 序号靠前的更可能进入今日抽查池，应先补音标/释义/用法/例句。
 */

export function sortEnVocabFillRowsByDailyOrder<T extends { id: number }>(
  rows: T[],
  dailyOrderIds: number[],
  limit?: number | null
): Array<T & { daily_seq: number | null }> {
  const rank = new Map<number, number>();
  dailyOrderIds.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i + 1);
  });

  const sorted = [...rows].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.id - b.id;
  });

  const sliced =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? sorted.slice(0, Math.floor(limit))
      : sorted;

  return sliced.map((row) => ({
    ...row,
    daily_seq: rank.get(row.id) ?? null,
  }));
}
