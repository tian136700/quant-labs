/** 登录链接 slug：日语罗马音 / 英文单词交替，形如 sakura-harbor-kyoto-garden-nara-breeze */

import { EN_SITE_URL } from "@/lib/en-site-host";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { KO_SITE_URL } from "@/lib/ko-site-host";
import type { RbacTeacherModules } from "@/lib/rbac";

export const LOGIN_LINK_SLUG_WORD_COUNT = 6;

export const LOGIN_LINK_SLUG_PATTERN = /^[a-z]+(?:-[a-z]+){5}$/;

export type LoginLinkSite = "jp" | "en" | "ko";

/** 仅按主 role（兼容旧调用）；多身份请用 loginLinkSiteForTeacher */
export function loginLinkSiteForRole(role: string | null | undefined): LoginLinkSite {
  if (role === "en_vocab") return "en";
  if (role === "ko_pron") return "ko";
  return "jp";
}

/**
 * 复制凭证 / 登录链接选子域名。
 * 优先看老师身份勾选（与列表「日语教师」一致）：日语 > 英语 > 韩语；
 * 全无勾选再回退主 role。避免「标签是日语、链接却是 english」。
 */
export function loginLinkSiteForTeacher(
  role?: string | null,
  modules?: Partial<RbacTeacherModules> | null
): LoginLinkSite {
  if (modules?.jp) return "jp";
  if (modules?.en) return "en";
  if (modules?.ko) return "ko";
  return loginLinkSiteForRole(role);
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

export function loginLinkPath(
  slug: string,
  username?: string | null
): string {
  const token = normalizeLoginLinkToken(slug);
  const name = (username ?? "").trim();
  // 路径里带用户名便于管理员辨认发给谁；兑换时只认 slug，用户名仅展示
  if (name) {
    return `/sign-in/${encodeURIComponent(name)}/${token}`;
  }
  return `/sign-in/${token}`;
}

/** 对外分享的登录链接用日语/英语/韩语子域名，避免 finance 金融域名引起误解 */
export function buildLoginLinkUrl(
  token: string,
  site: LoginLinkSite = "jp",
  username?: string | null
): string {
  const base =
    site === "en" ? EN_SITE_URL : site === "ko" ? KO_SITE_URL : JP_SITE_URL;
  return `${base}${loginLinkPath(token, username)}`;
}
