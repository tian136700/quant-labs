import type { Locale } from "@/i18n/messages";
import { normalizeClientIp } from "@/lib/client-ip";

export async function getLocalePref(
  db: D1Database,
  ip: string
): Promise<Locale | null> {
  const row = await db
    .prepare(`SELECT locale FROM locale_prefs WHERE ip = ?1`)
    .bind(ip)
    .first<{ locale: string }>();

  if (row?.locale === "zh" || row?.locale === "en") return row.locale;
  return null;
}

export async function setLocalePref(
  db: D1Database,
  ip: string,
  locale: Locale
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO locale_prefs (ip, locale, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(ip) DO UPDATE SET
         locale = excluded.locale,
         updated_at = excluded.updated_at`
    )
    .bind(ip, locale, now)
    .run();
}

export function clientIp(request: Request): string | null {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return normalizeClientIp(cf);
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return normalizeClientIp(xff.split(",")[0]);
  return null;
}
