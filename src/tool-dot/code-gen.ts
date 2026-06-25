/** 易读兑换码字符集（去掉 0/O、1/I/L） */
const CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomSegment(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}

export function generateToolDotCode(): string {
  return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

/** 用户输入规范化：大写、去空格、统一连字符 */
export function normalizeToolDotCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}
