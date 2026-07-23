/** 解析 D1 / 登录审计存库时间（UTC，无 Z 后缀或 ISO）为毫秒时间戳 */
export function parseStoredUtcDateTimeMs(iso: string): number {
  const trimmed = iso.trim();
  if (!trimmed) return Number.NaN;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  return Date.parse(normalized);
}

/** 将 ISO 或 D1 常见 UTC 时间（YYYY-MM-DD HH:mm:ss）格式化为北京时间，如 2026-06-13 06:08:18 */
export function formatBeijingDateTime(iso: string): string {
  const ms = parseStoredUtcDateTimeMs(iso);
  if (!Number.isFinite(ms)) return iso;
  const date = new Date(ms);

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** 移动端紧凑格式：MM-DD HH:mm（北京时间，无秒） */
export function formatBeijingDateTimeCompact(iso: string): string {
  const parts = formatBeijingDateTimeCompactParts(iso);
  return parts.time ? `${parts.date} ${parts.time}` : parts.date;
}

/** 窄列两行用：日期 MM-DD、时间 HH:mm（北京时间，无秒） */
export function formatBeijingDateTimeCompactParts(iso: string): {
  date: string;
  time: string;
} {
  const ms = parseStoredUtcDateTimeMs(iso);
  if (!Number.isFinite(ms)) return { date: iso, time: "" };
  const date = new Date(ms);

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    date: `${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
