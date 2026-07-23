/** 登录链接 slug：日语罗马音 / 英文单词交替，形如 sakura-harbor-kyoto-garden-nara-breeze */

import { EN_SITE_URL } from "@/lib/en-site-host";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { KO_SITE_URL } from "@/lib/ko-site-host";

export const LOGIN_LINK_SLUG_WORD_COUNT = 6;

export const LOGIN_LINK_SLUG_PATTERN = /^[a-z]+(?:-[a-z]+){5}$/;

export type LoginLinkSite = "jp" | "en" | "ko";

/** 按账号角色选对外子域名：英文老师用 english，韩语老师用 korean，其余默认 japanese（勿用 finance） */
export function loginLinkSiteForRole(role: string | null | undefined): LoginLinkSite {
  if (role === "en_vocab") return "en";
  if (role === "ko_pron") return "ko";
  return "jp";
}

const JP_ROMAJI_WORDS = [
  "aomori",
  "asahi",
  "chiba",
  "ebisu",
  "fuji",
  "ginza",
  "hana",
  "haru",
  "hyogo",
  "izumi",
  "kaze",
  "kobe",
  "kumo",
  "kawa",
  "kyoto",
  "mizu",
  "nara",
  "natsu",
  "osaka",
  "sakura",
  "sapporo",
  "sora",
  "sumi",
  "tokyo",
  "tsuki",
  "yama",
  "yoko",
  "yuki",
  "yume",
  "akita",
  "sendai",
  "kanazawa",
  "shizuoka",
  "okinawa",
  "hiroshima",
];

const EN_WORDS = [
  "amber",
  "breeze",
  "bridge",
  "cedar",
  "coral",
  "dawn",
  "field",
  "garden",
  "harbor",
  "iris",
  "kelp",
  "maple",
  "meadow",
  "north",
  "ocean",
  "orchid",
  "pearl",
  "pilot",
  "quest",
  "river",
  "silver",
  "study",
  "trail",
  "voyage",
  "willow",
  "lesson",
  "focus",
  "spark",
  "plain",
  "summit",
  "valley",
  "winter",
  "spring",
  "anchor",
  "compass",
];

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pickUniqueWords(pool: readonly string[], count: number): string[] {
  if (count > pool.length) {
    throw new Error("word pool too small");
  }
  const remaining = [...pool];
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = randomIndex(remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

/** 生成 6 段助记词 slug（jp-en 交替） */
export function newLoginLinkSlug(): string {
  const jp = pickUniqueWords(JP_ROMAJI_WORDS, 3);
  const en = pickUniqueWords(EN_WORDS, 3);
  return [jp[0], en[0], jp[1], en[1], jp[2], en[2]].join("-");
}

export function isLoginLinkSlugFormat(value: string): boolean {
  return LOGIN_LINK_SLUG_PATTERN.test(value);
}

export function normalizeLoginLinkToken(raw: string): string {
  const trimmed = raw.trim();
  if (isLoginLinkSlugFormat(trimmed.toLowerCase())) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function loginLinkPath(slug: string): string {
  return `/sign-in/${normalizeLoginLinkToken(slug)}`;
}

/** 对外分享的登录链接用日语/英语/韩语子域名，避免 finance 金融域名引起误解 */
export function buildLoginLinkUrl(
  token: string,
  site: LoginLinkSite = "jp"
): string {
  const base =
    site === "en" ? EN_SITE_URL : site === "ko" ? KO_SITE_URL : JP_SITE_URL;
  return `${base}${loginLinkPath(token)}`;
}
