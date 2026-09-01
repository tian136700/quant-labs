/** Cloudflare D1 免费档日配额（多子域共用同一库 strategy-compare-db） */
export const D1_FREE_ROW_READ_LIMIT = 5_000_000;
export const D1_FREE_ROW_WRITE_LIMIT = 100_000;

export type D1QuotaSignalKind = "row_read_limit" | "row_write_limit";

export type D1QuotaProbeStatus =
  | "ok"
  | "row_read_limited"
  | "row_write_limited"
  | "error";

/** 从 D1 抛错文案识别配额类错误（勿依赖精确 D1_ERROR 前缀） */
export function classifyD1QuotaError(err: unknown): D1QuotaSignalKind | null {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (
    msg.includes("daily row read limit") ||
    msg.includes("exceeded daily row read") ||
    msg.includes("row read limit")
  ) {
    return "row_read_limit";
  }
  if (
    msg.includes("daily row write limit") ||
    msg.includes("exceeded daily row write") ||
    msg.includes("row write limit")
  ) {
    return "row_write_limit";
  }
  return null;
}

export function isD1QuotaError(err: unknown): boolean {
  return classifyD1QuotaError(err) !== null;
}

export function d1QuotaProbeStatusFromError(err: unknown): D1QuotaProbeStatus {
  const kind = classifyD1QuotaError(err);
  if (kind === "row_read_limit") return "row_read_limited";
  if (kind === "row_write_limit") return "row_write_limited";
  return "error";
}

export function d1QuotaSignalLabel(kind: D1QuotaSignalKind): string {
  if (kind === "row_read_limit") return "日读行数顶满";
  return "日写行数顶满";
}
