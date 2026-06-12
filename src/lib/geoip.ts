import type { Locale } from "@/i18n/messages";

const COUNTRY_NAMES: Record<string, { en: string; zh: string }> = {
  CN: { en: "China", zh: "中国" },
  HK: { en: "Hong Kong", zh: "中国香港" },
  MO: { en: "Macau", zh: "中国澳门" },
  TW: { en: "Taiwan", zh: "中国台湾" },
  US: { en: "United States", zh: "美国" },
  GB: { en: "United Kingdom", zh: "英国" },
  JP: { en: "Japan", zh: "日本" },
  KR: { en: "South Korea", zh: "韩国" },
  SG: { en: "Singapore", zh: "新加坡" },
  AU: { en: "Australia", zh: "澳大利亚" },
  CA: { en: "Canada", zh: "加拿大" },
  DE: { en: "Germany", zh: "德国" },
  FR: { en: "France", zh: "法国" },
  IN: { en: "India", zh: "印度" },
};

export function clientCountryCode(request: Request): string | null {
  const cc = request.headers.get("CF-IPCountry");
  if (!cc || cc === "XX" || cc.length !== 2) return null;
  return cc.toUpperCase();
}

/** 首次访问时按 IP 国家建议默认语言（仅 CN 默认中文） */
export function localeFromCountry(countryCode: string | null): Locale {
  return countryCode === "CN" ? "zh" : "en";
}

export function countryDisplayName(
  countryCode: string | null,
  locale: Locale
): string {
  if (!countryCode) {
    return locale === "zh" ? "未知" : "Unknown";
  }
  const entry = COUNTRY_NAMES[countryCode];
  if (entry) return entry[locale];
  return countryCode;
}
