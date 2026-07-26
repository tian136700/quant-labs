import "server-only";

import { ipKey } from "@/lib/client-ip";
import {
  fetchIp9Geo,
  formatIp9RegionLabel,
  type Ip9GeoData,
} from "@/lib/ip9-geo";
import { etrAuthDbState, nowIso } from "./state";

export type EtrIpGeoCacheRow = {
  ip: string;
  country: string | null;
  country_code: string | null;
  prov: string | null;
  city: string | null;
  area: string | null;
  isp: string | null;
  region_label: string;
  fetched_at: string;
  ok: boolean;
};

type DevIpGeo = Omit<EtrIpGeoCacheRow, "region_label"> & {
  region_label?: string;
};

let ipGeoSchemaReady = false;

/** 失败缓存最短保留，避免短时间反复打爆 ip9 */
const NEGATIVE_CACHE_MS = 6 * 60 * 60 * 1000;

export async function ensureEtrIpGeoCacheSchema(db: D1Database): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || ipGeoSchemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_ip_geo_cache (
         ip            TEXT NOT NULL PRIMARY KEY,
         country       TEXT,
         country_code  TEXT,
         prov          TEXT,
         city          TEXT,
         area          TEXT,
         isp           TEXT,
         ok            INTEGER NOT NULL DEFAULT 1,
         fetched_at    TEXT NOT NULL
       )`
    )
    .run();

  ipGeoSchemaReady = true;
}

function toPublic(row: {
  ip: string;
  country: string | null;
  country_code: string | null;
  prov: string | null;
  city: string | null;
  area: string | null;
  isp: string | null;
  ok: boolean;
  fetched_at: string;
}): EtrIpGeoCacheRow {
  const region_label = row.ok
    ? formatIp9RegionLabel({
        prov: row.prov,
        city: row.city,
        area: row.area,
        country: row.country,
      })
    : "";
  return { ...row, region_label };
}

function isNegativeFresh(fetchedAt: string): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < NEGATIVE_CACHE_MS;
}

export async function getCachedIpGeo(
  db: D1Database,
  rawIp: string
): Promise<EtrIpGeoCacheRow | null> {
  const key = ipKey(rawIp);
  if (!key) return null;

  if (etrAuthDbState.devAuthEnabled) {
    const hit = (etrAuthDbState.devIpGeoCache as DevIpGeo[]).find((r) => r.ip === key);
    if (!hit) return null;
    if (!hit.ok && !isNegativeFresh(hit.fetched_at)) return null;
    return toPublic({ ...hit, ok: Boolean(hit.ok) });
  }

  await ensureEtrIpGeoCacheSchema(db);
  const row = await db
    .prepare(
      `SELECT ip, country, country_code, prov, city, area, isp, ok, fetched_at
       FROM etr_ip_geo_cache WHERE ip = ?1 LIMIT 1`
    )
    .bind(key)
    .first<{
      ip: string;
      country: string | null;
      country_code: string | null;
      prov: string | null;
      city: string | null;
      area: string | null;
      isp: string | null;
      ok: number;
      fetched_at: string;
    }>();

  if (!row) return null;
  const ok = Number(row.ok) !== 0;
  if (!ok && !isNegativeFresh(row.fetched_at)) return null;
  return toPublic({
    ip: row.ip,
    country: row.country ?? null,
    country_code: row.country_code ?? null,
    prov: row.prov ?? null,
    city: row.city ?? null,
    area: row.area ?? null,
    isp: row.isp ?? null,
    ok,
    fetched_at: row.fetched_at,
  });
}

export async function getCachedIpGeoMap(
  db: D1Database,
  rawIps: string[]
): Promise<Map<string, EtrIpGeoCacheRow>> {
  const keys = [...new Set(rawIps.map((ip) => ipKey(ip)).filter(Boolean))];
  const out = new Map<string, EtrIpGeoCacheRow>();
  if (keys.length === 0) return out;

  if (etrAuthDbState.devAuthEnabled) {
    for (const key of keys) {
      const hit = await getCachedIpGeo(db, key);
      if (hit) out.set(key, hit);
    }
    return out;
  }

  await ensureEtrIpGeoCacheSchema(db);
  // D1 绑定上限宽松；历史最多 ~100 个唯一 IP，分批 IN
  const chunkSize = 40;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(", ");
    const result = await db
      .prepare(
        `SELECT ip, country, country_code, prov, city, area, isp, ok, fetched_at
         FROM etr_ip_geo_cache
         WHERE ip IN (${placeholders})`
      )
      .bind(...chunk)
      .all<{
        ip: string;
        country: string | null;
        country_code: string | null;
        prov: string | null;
        city: string | null;
        area: string | null;
        isp: string | null;
        ok: number;
        fetched_at: string;
      }>();

    for (const row of result.results ?? []) {
      const ok = Number(row.ok) !== 0;
      if (!ok && !isNegativeFresh(row.fetched_at)) continue;
      const pub = toPublic({
        ip: row.ip,
        country: row.country ?? null,
        country_code: row.country_code ?? null,
        prov: row.prov ?? null,
        city: row.city ?? null,
        area: row.area ?? null,
        isp: row.isp ?? null,
        ok,
        fetched_at: row.fetched_at,
      });
      out.set(pub.ip, pub);
    }
  }
  return out;
}

async function writeIpGeoCache(
  db: D1Database,
  geo: Ip9GeoData | null,
  key: string
): Promise<EtrIpGeoCacheRow> {
  const fetched_at = nowIso();
  const row = geo
    ? {
        ip: key,
        country: geo.country,
        country_code: geo.country_code,
        prov: geo.prov,
        city: geo.city,
        area: geo.area,
        isp: geo.isp,
        ok: true,
        fetched_at,
      }
    : {
        ip: key,
        country: null,
        country_code: null,
        prov: null,
        city: null,
        area: null,
        isp: null,
        ok: false,
        fetched_at,
      };

  if (etrAuthDbState.devAuthEnabled) {
    const list = etrAuthDbState.devIpGeoCache as DevIpGeo[];
    const idx = list.findIndex((r) => r.ip === key);
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    return toPublic(row);
  }

  await ensureEtrIpGeoCacheSchema(db);
  await db
    .prepare(
      `INSERT INTO etr_ip_geo_cache
         (ip, country, country_code, prov, city, area, isp, ok, fetched_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(ip) DO UPDATE SET
         country = excluded.country,
         country_code = excluded.country_code,
         prov = excluded.prov,
         city = excluded.city,
         area = excluded.area,
         isp = excluded.isp,
         ok = excluded.ok,
         fetched_at = excluded.fetched_at`
    )
    .bind(
      row.ip,
      row.country,
      row.country_code,
      row.prov,
      row.city,
      row.area,
      row.isp,
      row.ok ? 1 : 0,
      row.fetched_at
    )
    .run();

  return toPublic(row);
}

/**
 * 读缓存；未命中再串行打 ip9 并写入。
 * 调用方必须保证「一次只查一个 IP」，不要循环并发。
 * `force: true` 时跳过成功缓存，强制向 ip9 再查一次（定时回填 / 重跑用）。
 */
export async function resolveIpGeoCached(
  db: D1Database,
  rawIp: string,
  opts?: { force?: boolean }
): Promise<EtrIpGeoCacheRow | null> {
  const key = ipKey(rawIp);
  if (!key) return null;

  if (!opts?.force) {
    const cached = await getCachedIpGeo(db, key);
    if (cached) return cached;
  }

  let geo: Ip9GeoData | null = null;
  try {
    geo = await fetchIp9Geo(key);
  } catch {
    geo = null;
  }
  return writeIpGeoCache(db, geo, key);
}
