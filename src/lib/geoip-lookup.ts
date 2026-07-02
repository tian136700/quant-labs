import { findCachedGeoForIp } from "@/lib/analytics-db";
import { clientGeoFromRequest, type ClientGeo } from "@/lib/geoip";

const LOOKUP_TIMEOUT_MS = 3500;

function needsGeoEnrichment(geo: ClientGeo): boolean {
  return (
    !geo.region?.trim() &&
    !geo.city?.trim() &&
    !geo.region_code?.trim()
  );
}

function mergeGeo(base: ClientGeo, extra: Partial<ClientGeo>): ClientGeo {
  return {
    country_code: base.country_code ?? extra.country_code ?? null,
    region: base.region?.trim() || extra.region?.trim() || null,
    region_code: base.region_code?.trim() || extra.region_code?.trim() || null,
    city: base.city?.trim() || extra.city?.trim() || null,
  };
}

type IpApiResponse = {
  status?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  message?: string;
};

async function lookupFromIpApi(ip: string): Promise<ClientGeo | null> {
  const url =
    `http://ip-api.com/json/${encodeURIComponent(ip)}` +
    "?lang=zh-CN&fields=status,countryCode,regionName,city,message";

  const res = await fetch(url, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    headers: { "User-Agent": "strategy-compare-cloud/1.0" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as IpApiResponse;
  if (data.status !== "success") return null;

  const region = data.regionName?.trim() || null;
  const city = data.city?.trim() || null;
  const country_code = data.countryCode?.trim().toUpperCase() || null;
  if (!region && !city && !country_code) return null;

  return { country_code, region, region_code: null, city };
}

type IpWhoResponse = {
  success?: boolean;
  country_code?: string;
  region?: string;
  city?: string;
};

/** HTTPS 备用（ip-api 在 Cloudflare Worker 上偶发不可用） */
async function lookupFromIpWho(ip: string): Promise<ClientGeo | null> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    headers: { "User-Agent": "strategy-compare-cloud/1.0" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as IpWhoResponse;
  if (!data.success) return null;

  const region = data.region?.trim() || null;
  const city = data.city?.trim() || null;
  const country_code = data.country_code?.trim().toUpperCase() || null;
  if (!region && !city && !country_code) return null;

  return { country_code, region, region_code: null, city };
}

async function lookupGeoByIp(ip: string): Promise<ClientGeo | null> {
  try {
    return (await lookupFromIpApi(ip)) ?? (await lookupFromIpWho(ip));
  } catch {
    return null;
  }
}

/**
 * Cloudflare 对中国 IPv6 常只返回 country=CN、无省市；
 * 缺省时查 D1 缓存 → ip-api → ipwho.is。
 */
export async function resolveClientGeo(
  request: Request,
  ip: string,
  db?: D1Database
): Promise<ClientGeo> {
  const cfGeo = clientGeoFromRequest(request);
  if (!needsGeoEnrichment(cfGeo)) return cfGeo;

  if (db) {
    const cached = await findCachedGeoForIp(db, ip);
    if (cached) return mergeGeo(cfGeo, cached);
  }

  const lookedUp = await lookupGeoByIp(ip);
  if (lookedUp) return mergeGeo(cfGeo, lookedUp);

  return cfGeo;
}
