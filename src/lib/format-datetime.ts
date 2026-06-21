/** 将 ISO 或 D1 常见 UTC 时间（YYYY-MM-DD HH:mm:ss）格式化为北京时间，如 2026-06-13 06:08:18 */
export function formatBeijingDateTime(iso: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? `${iso.replace(" ", "T")}Z`
    : iso;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;

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
