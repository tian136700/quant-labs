/** 浏览器与 API 共用的 1102 客户端事件类型（勿引用 D1 / Cloudflare） */

export type Worker1102ClientEventKind =
  | "cf_1102_html"
  | "api_5xx"
  | "page_ok"
  | "fetch_network"
  | "shared_fail";

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
