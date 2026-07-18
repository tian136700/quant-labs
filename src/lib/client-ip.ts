const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function parseIpv4(raw: string): string | null {
  if (!IPV4_RE.test(raw)) return null;
  const parts = raw.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return parts.join(".");
}

function stripIpv6Zone(raw: string): string {
  const idx = raw.indexOf("%");
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

function expandIpv6(raw: string): string[] | null {
  let input = stripIpv6Zone(raw.trim().toLowerCase());
  if (!input) return null;

  const v4Tail = input.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Tail) {
    const v4 = parseIpv4(v4Tail[2]);
    if (!v4) return null;
    const octets = v4.split(".").map((n) => Number.parseInt(n, 10));
    const hi = ((octets[0] << 8) | octets[1]).toString(16).padStart(4, "0");
    const lo = ((octets[2] << 8) | octets[3]).toString(16).padStart(4, "0");
    input = `${v4Tail[1] || "0"}:${hi}:${lo}`;
  }

  if (!/^[0-9a-f:]+$/.test(input)) return null;

  let head: string[] = [];
  let tail: string[] = [];
  if (input.includes("::")) {
    const [left, right] = input.split("::", 2);
    head = left ? left.split(":").filter(Boolean) : [];
    tail = right ? right.split(":").filter(Boolean) : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    const groups = [...head, ...Array(missing).fill("0"), ...tail];
    if (groups.length !== 8) return null;
    return groups.map((g) => g.padStart(4, "0").slice(-4));
  }

  const parts = input.split(":").filter(Boolean);
  if (parts.length !== 8) return null;
  return parts.map((g) => g.padStart(4, "0").slice(-4));
}

function compressIpv6(groups: string[]): string {
  const normalized = groups.map((g) => g.replace(/^0+/, "") || "0");

  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < normalized.length) {
    if (normalized[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < normalized.length && normalized[j] === "0") j++;
    const len = j - i;
    if (len > bestLen) {
      bestStart = i;
      bestLen = len;
    }
    i = j;
  }

  if (bestLen < 2) {
    return normalized.join(":");
  }

  const head = normalized.slice(0, bestStart);
  const tail = normalized.slice(bestStart + bestLen);
  if (head.length === 0 && tail.length === 0) return "::";
  if (head.length === 0) return `::${tail.join(":")}`;
  if (tail.length === 0) return `${head.join(":")}::`;
  return `${head.join(":")}::${tail.join(":")}`;
}

function normalizeIpv6(raw: string): string | null {
  const groups = expandIpv6(raw);
  if (!groups) return null;
  return compressIpv6(groups);
}

/** 统一客户端 IP：去空白、IPv4-mapped 转 IPv4、IPv6 规范压缩 */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const v4 = parseIpv4(trimmed);
  if (v4) return v4;

  const mapped = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) {
    const inner = parseIpv4(mapped[1]);
    if (inner) return inner;
  }

  const v6 = normalizeIpv6(trimmed);
  return v6 ?? trimmed;
}

/** 后台展示用：与 normalizeClientIp 一致，保证同址同形 */
export function formatIpForDisplay(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  return normalizeClientIp(raw) ?? raw.trim();
}

/** 表格/卡片单元格：长 IP 按固定宽度折行（默认每行 8 字符） */
export function foldIpDisplayChunks(
  raw: string | null | undefined,
  maxCharsPerLine = 8,
): string[] {
  const display = formatIpForDisplay(raw);
  if (display === "—" || maxCharsPerLine < 1) return [display];
  if (display.length <= maxCharsPerLine) return [display];
  const parts: string[] = [];
  for (let i = 0; i < display.length; i += maxCharsPerLine) {
    parts.push(display.slice(i, i + maxCharsPerLine));
  }
  return parts;
}

/** 与 foldIpDisplayChunks 相同，用换行符拼接（纯文本场景） */
export function foldIpForDisplay(
  raw: string | null | undefined,
  maxCharsPerLine = 8,
): string {
  return foldIpDisplayChunks(raw, maxCharsPerLine).join("\n");
}

export function ipKey(raw: string | null | undefined): string {
  return normalizeClientIp(raw) ?? raw?.trim() ?? "";
}
