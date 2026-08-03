/**
 * D1 `IN (?,?,…)` 绑定变量上限为 100（含其它 ?）。
 * 超过会报：variable number must be between ?1 and ?100。
 * 列表按课次 id 批量查老师/上课时间时必须分片。
 */
export const D1_IN_CHUNK_SIZE = 80;

export function chunkIdsForD1In<T>(ids: readonly T[], chunkSize = D1_IN_CHUNK_SIZE): T[][] {
  const size = Math.max(1, Math.min(chunkSize, 100));
  if (ids.length <= size) return ids.length ? [ids.slice()] : [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}
