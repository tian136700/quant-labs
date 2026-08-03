/** 浏览器与 API 共用的 1102 客户端事件类型（勿引用 D1 / Cloudflare） */

export type Worker1102ClientEventKind =
  | "cf_1102_html"
  | "api_5xx"
  | "page_ok"
  | "fetch_network"
  | "shared_fail";

/** fetch / shared 失败原因（写入 detail.reason，看板可直接看） */
export type Worker1102FetchFailReason =
  | "abort"
  | "timeout"
  | "load_failed"
  | "failed_to_fetch"
  | "cf_1102_html"
  | "http_5xx"
  | "other";

export function parseCf1102FromText(text: string): {
  is1102: boolean;
  cfRay: string;
  snip: string;
} {
  const is1102 = /Error\s*1102|Worker exceeded resource limits/i.test(text);
  const rayMatch =
    text.match(/Cloudflare Ray ID[:\s]*<[^>]*>([a-f0-9]+)/i) ||
    text.match(/Ray ID[:\s]*([a-f0-9]{8,})/i);
  return {
    is1102,
    cfRay: rayMatch?.[1] ?? "",
    snip: text.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

/** 把 AbortError / Load failed / Failed to fetch 收成稳定 reason，方便看板过滤 */
export function classifyWorker1102FetchFailReason(
  err: unknown
): Worker1102FetchFailReason {
  if (err == null) return "other";
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name?: unknown }).name || "")
      : "";
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  const lower = msg.toLowerCase();
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /aborted|abort(?:ed)?|signal timed out/i.test(msg)
  ) {
    if (/timeout|timed out/i.test(msg) || name === "TimeoutError") {
      return "timeout";
    }
    return "abort";
  }
  if (/load failed/i.test(msg)) return "load_failed";
  if (/failed to fetch|networkerror|network request failed/i.test(lower)) {
    return "failed_to_fetch";
  }
  if (/error\s*1102|worker exceeded/i.test(msg)) return "cf_1102_html";
  return "other";
}

export function worker1102PageHostFromHref(href: string): string {
  try {
    if (!href) return "";
    return new URL(href).host || "";
  } catch {
    return "";
  }
}
