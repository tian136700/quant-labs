import type { Locale } from "@/i18n/messages";
import { COUNTRY_NAMES } from "./country-names";

export function clientCountryCode(request: Request): string | null {
  const cc = request.headers.get("CF-IPCountry");
  if (!cc || cc === "XX" || cc.length !== 2) return null;
  return cc.toUpperCase();
}

/** 首次访问时按 IP 国家建议默认语言（中国大陆、港、台、澳默认中文） */
const ZH_GEO_COUNTRIES = new Set(["CN", "HK", "TW", "MO"]);

export function localeFromCountry(countryCode: string | null): Locale {
  if (countryCode && ZH_GEO_COUNTRIES.has(countryCode)) return "zh";
  return "en";
}

export function countryDisplayName(
  countryCode: string | null,
  locale: Locale
): string {
  if (!countryCode) {
    return locale === "zh" ? "未知" : "Unknown";
  }
  const code = countryCode.toUpperCase();
  const entry = COUNTRY_NAMES[code];
  if (entry) return entry[locale];
  return code;
}
