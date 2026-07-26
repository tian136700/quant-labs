import "server-only";

import { ipKey } from "@/lib/client-ip";

/** 对 ip9.com.cn 的最小间隔（毫秒）——全 Worker 实例内串行；与 Mac 定时 30s 对齐，禁止打爆免费接口 */
export const IP9_MIN_INTERVAL_MS = 30_000;
const IP9_TIMEOUT_MS = 8000;
const IP9_ENDPOINT = "https://ip9.com.cn/get";

export type Ip9GeoData = {
  ip: string;
  country: string | null;
  country_code: string | null;
  prov: string | null;
  city: string | null;
  /** 区县（精确到县） */
  area: string | null;
  isp: string | null;
};

type Ip9ApiResponse = {
  ret?: number;
  data?: {
    ip?: string;
    country?: string;
    country_code?: string;
    prov?: string;
    city?: string;
    area?: string;
    isp?: string;
  };
};

let lastOutboundAt = 0;
let outboundChain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t ? t : null;
}

/** 展示：省 市 区县（跳过空段与省市同名） */
export function formatIp9RegionLabel(geo: Pick<Ip9GeoData, "prov" | "city" | "area" | "country">): string {
  const parts: string[] = [];
  const prov = trimOrNull(geo.prov);
  const city = trimOrNull(geo.city);
  const area = trimOrNull(geo.area);
  if (prov) parts.push(prov);
  if (city && city !== prov) parts.push(city);
  if (area && area !== city && area !== prov) parts.push(area);
  if (parts.length === 0) {
    const country = trimOrNull(geo.country);
    if (country) return country;
  }
  return parts.join(" ");
}

/**
 * 串行节流调用 ip9。同一 isolate 内排队；两次真实请求间隔 ≥ IP9_MIN_INTERVAL_MS。
 * 禁止 Promise.all 批量打该接口。
 */
export async function fetchIp9Geo(rawIp: string): Promise<Ip9GeoData | null> {
  const key = ipKey(rawIp);
  if (!key) return null;

  const run = async (): Promise<Ip9GeoData | null> => {
    const wait = Math.max(0, IP9_MIN_INTERVAL_MS - (Date.now() - lastOutboundAt));
    if (wait > 0) await sleep(wait);
    lastOutboundAt = Date.now();

    const url = `${IP9_ENDPOINT}?ip=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IP9_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": "strategy-compare-cloud/admin-ip-geo" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Ip9ApiResponse;
    if (body.ret !== 200 || !body.data) return null;

    const data = body.data;
    return {
      ip: trimOrNull(data.ip) || key,
      country: trimOrNull(data.country),
      country_code: trimOrNull(data.country_code)?.toLowerCase() ?? null,
      prov: trimOrNull(data.prov),
      city: trimOrNull(data.city),
      area: trimOrNull(data.area),
      isp: trimOrNull(data.isp),
    };
  };

  const next = outboundChain.then(run, run);
  // 链上只排队，不把失败传染给后续
  outboundChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}
