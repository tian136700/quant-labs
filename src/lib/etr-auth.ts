/** 默认管理员用户名（密码必须通过环境变量 ETR_ADMIN_PASSWORD 配置，勿写入 Git） */
export const ETR_DEFAULT_ADMIN_USERNAME = "Admin";

/** 日语单词模块专用账号（英文用户名，对应「李老师」） */
export const ETR_DEFAULT_JP_VOCAB_USERNAME = "LiLaoshi";

/** 日语单词模块第二账号（登录名 user1） */
export const ETR_DEFAULT_JP_VOCAB_USER1_USERNAME = "user1";

export const ETR_SESSION_COOKIE = "etr_session";

/** Admin 登录有效期：半年 */
export const ETR_ADMIN_SESSION_MS = 180 * 24 * 60 * 60 * 1000;
/** 日语模块老师登录有效期：30 天 */
export const ETR_JP_VOCAB_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
/** 登录链接兑换后的会话有效期：30 天 */
export const ETR_LOGIN_LINK_SESSION_MS = ETR_JP_VOCAB_SESSION_MS;
/** 登录链接本身长期有效（停用账号即可收回访问） */
export const ETR_LOGIN_LINK_PERMANENT_EXPIRES_AT = "2099-12-31T23:59:59.999Z";
/** 普通用户登录有效期：7 天 */
export const ETR_USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type EtrUserRole = "admin" | "user" | "jp_vocab" | "en_vocab" | "ko_pron";

export interface EtrUser {
  id: number;
  username: string;
  role: EtrUserRole;
  created_at: string;
  /** 1 = 已禁用（登录与已登录会话均视为维护中） */
  disabled?: number;
  /**
   * 1 = 永不禁用：课表/抽完等定时启禁一律跳过；
   * 仅管理员在用户管理里手动取消后才恢复自动启禁。
   */
  never_disable?: number;
  last_login_at?: string | null;
  last_login_ip?: string | null;
}

export interface EtrSessionUser extends EtrUser {
  expires_at: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashPassword(
  password: string,
  salt?: Uint8Array
): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  return {
    salt: bytesToBase64(saltBytes),
    hash: bytesToBase64(new Uint8Array(bits)),
  };
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  const { hash } = await hashPassword(password, base64ToBytes(saltB64));
  return hash === hashB64;
}

export function encodePasswordStorage(salt: string, hash: string): string {
  return `${salt}:${hash}`;
}

export function sessionTtlMs(role: EtrUserRole): number {
  if (role === "admin") return ETR_ADMIN_SESSION_MS;
  if (role === "jp_vocab" || role === "en_vocab" || role === "ko_pron") {
    return ETR_JP_VOCAB_SESSION_MS;
  }
  return ETR_USER_SESSION_MS;
}

export function canAccessJpVocab(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "admin" || r === "jp_vocab";
}

export function isJpVocabTeacherRole(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "jp_vocab";
}

/** 是否可在日语单词页勾选/重置（含李老师用户名兜底） */
export function canUserOperateJpVocab(
  user: { username?: string; role?: string } | null | undefined
): boolean {
  if (!user) return false;
  if (canAccessJpVocab(user.role as EtrUserRole)) return true;
  const name = user.username?.trim().toLowerCase();
  return name === ETR_DEFAULT_JP_VOCAB_USERNAME.toLowerCase();
}

export function canAccessJpVocabTeacherPage(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  const perms = user.permissions ?? [];
  if (perms.includes("jp_vocab:teacher")) return true;
  if (perms.includes("jp_vocab:operate")) return true;
  return canUserOperateJpVocab(user);
}

/** 日语抽问-管理员端：管理员或持有 jp_vocab:admin */
export function canAccessJpVocabAdminPage(
  user: { role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  return user.permissions?.includes("jp_vocab:admin") ?? false;
}

/** 今日日语单词：管理员，或持有 jp_vocab:study 的学生（日语老师不可访问） */
export function canAccessJpVocabStudy(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  if (canUserOperateJpVocab(user)) return false;
  if (user.permissions?.includes("jp_vocab:operate")) return false;
  return user.permissions?.includes("jp_vocab:study") ?? false;
}

/**
 * 课堂带读账号白名单（角色权限默认不含 coach；按人临时开放）。
 * 当前：欣欣 XinXin；李老师 LiLaoshi / 玉老师 YuLaoshi 等不在名单内。
 */
export const JP_VOCAB_COACH_ALLOWED_USERNAMES = ["XinXin"] as const;

/** 课堂带读：管理员、持有 jp_vocab:coach，或白名单账号 */
export function canAccessJpVocabCoach(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  if (user.permissions?.includes("jp_vocab:coach")) return true;
  const name = user.username?.trim().toLowerCase();
  if (!name) return false;
  return JP_VOCAB_COACH_ALLOWED_USERNAMES.some(
    (allowed) => allowed.toLowerCase() === name
  );
}

export function canAccessEnVocab(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "admin" || r === "en_vocab";
}

export function isEnVocabTeacherRole(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "en_vocab";
}

/** 是否可在英语单词页勾选/重置/共享 */
export function canUserOperateEnVocab(
  user: { username?: string; role?: string } | null | undefined
): boolean {
  if (!user) return false;
  return canAccessEnVocab(user.role as EtrUserRole);
}

/**
 * 今日英语单词：仅管理员（或持有 en_vocab:study 的学生）。
 * 英语老师不可访问——对齐日语 canAccessJpVocabStudy，避免老师导航/页面过杂。
 */
export function canAccessEnVocabStudy(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  if (canUserOperateEnVocab(user)) return false;
  if (user.permissions?.includes("en_vocab:operate")) return false;
  if (user.permissions?.includes("en_vocab:teacher")) return false;
  return user.permissions?.includes("en_vocab:study") ?? false;
}

export function canAccessEnVocabTeacherPage(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  const perms = user.permissions ?? [];
  if (perms.includes("en_vocab:teacher")) return true;
  if (perms.includes("en_vocab:operate")) return true;
  return canUserOperateEnVocab(user);
}

/** 英语抽背-管理员端：管理员或持有 en_vocab:admin */
export function canAccessEnVocabAdminPage(
  user: { role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  return user.permissions?.includes("en_vocab:admin") ?? false;
}

export function canAccessKoPron(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "admin" || r === "ko_pron";
}

export function isKoPronTeacherRole(role: EtrUserRole | string | undefined): boolean {
  const r = typeof role === "string" ? role.trim() : "";
  return r === "ko_pron";
}

export function canUserOperateKoPron(
  user: { username?: string; role?: string } | null | undefined
): boolean {
  if (!user) return false;
  return canAccessKoPron(user.role as EtrUserRole);
}

export function canAccessKoPronTeacherPage(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  const perms = user.permissions ?? [];
  if (perms.includes("ko_pron:teacher")) return true;
  if (perms.includes("ko_pron:operate")) return true;
  return canUserOperateKoPron(user);
}

/** 韩语发音-管理员端：管理员或持有 ko_pron:admin */
export function canAccessKoPronAdminPage(
  user: { role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  return user.permissions?.includes("ko_pron:admin") ?? false;
}

/** 今日韩语发音：管理员，或持有 ko_pron:study 的学生（韩语老师不可访问） */
export function canAccessKoPronStudy(
  user: { username?: string; role?: string; permissions?: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.trim() : "";
  if (role === "admin") return true;
  if (canUserOperateKoPron(user)) return false;
  if (user.permissions?.includes("ko_pron:operate")) return false;
  if (user.permissions?.includes("ko_pron:teacher")) return false;
  return user.permissions?.includes("ko_pron:study") ?? false;
}

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export const ETR_USERNAME_MIN_LENGTH = 4;
export const ETR_USERNAME_MAX_LENGTH = 32;
export const ETR_PASSWORD_MIN_LENGTH = 6;

export function isValidUsername(username: string): boolean {
  if (typeof username !== "string") return false;
  if (
    username.length < ETR_USERNAME_MIN_LENGTH ||
    username.length > ETR_USERNAME_MAX_LENGTH
  ) {
    return false;
  }
  return /^[\w\u4e00-\u9fff.-]+$/u.test(username);
}

export function isReservedUsername(
  username: string,
  adminUsername = ETR_DEFAULT_ADMIN_USERNAME,
  jpVocabUsername = ETR_DEFAULT_JP_VOCAB_USERNAME,
  jpVocabUser1Username = ETR_DEFAULT_JP_VOCAB_USER1_USERNAME
): boolean {
  const lower = username.toLowerCase();
  return (
    lower === adminUsername.toLowerCase() ||
    lower === jpVocabUsername.toLowerCase() ||
    lower === jpVocabUser1Username.toLowerCase()
  );
}

export type AdminBootstrap = {
  username: string;
  password: string;
};

export type JpVocabBootstrap = AdminBootstrap;

/** 从 Worker 环境变量读取管理员初始化凭据（密码不得出现在源码或 Git 中） */
export function resolveAdminBootstrap(env: {
  ETR_ADMIN_USERNAME?: string;
  ETR_ADMIN_PASSWORD?: string;
}): AdminBootstrap | null {
  const password = env.ETR_ADMIN_PASSWORD?.trim();
  if (!password) return null;
  const username = env.ETR_ADMIN_USERNAME?.trim() || ETR_DEFAULT_ADMIN_USERNAME;
  return { username, password };
}

/** 日语单词模块老师账号（密码不得出现在源码或 Git 中） */
export function resolveJpVocabBootstrap(env: {
  ETR_JP_VOCAB_USERNAME?: string;
  ETR_JP_VOCAB_PASSWORD?: string;
}): JpVocabBootstrap | null {
  const password = env.ETR_JP_VOCAB_PASSWORD?.trim();
  if (!password) return null;
  const username =
    env.ETR_JP_VOCAB_USERNAME?.trim() || ETR_DEFAULT_JP_VOCAB_USERNAME;
  return { username, password };
}

/** 老师 / 管理员 bootstrap 密码最低要求（仅环境变量配置，不写进源码） */
export function isBootstrapPasswordAcceptable(password: string): boolean {
  if (password.length < 10) return false;
  const weak = new Set([
    "123456",
    "12345678",
    "123456789",
    "1234567890",
    "password",
    "password1",
    "admin123",
    "admin1234",
    "qwerty123",
    "user123456",
  ]);
  return !weak.has(password.toLowerCase());
}

/** 日语单词模块 user1 账号（与李老师同 jp_vocab 权限；密码仅环境变量/Secret，至少 10 位） */
export function resolveJpVocabUser1Bootstrap(env: {
  ETR_JP_VOCAB_USER1_USERNAME?: string;
  ETR_JP_VOCAB_USER1_PASSWORD?: string;
}): JpVocabBootstrap | null {
  const password = env.ETR_JP_VOCAB_USER1_PASSWORD?.trim();
  if (!password || !isBootstrapPasswordAcceptable(password)) return null;
  const username =
    env.ETR_JP_VOCAB_USER1_USERNAME?.trim() ||
    ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;
  return { username, password };
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  const tokens = parseAllSessionCookies(cookieHeader);
  return tokens[0] ?? null;
}

/** 读取 Cookie 中全部 etr_session（普通浏览器可能残留多条冲突记录） */
export function parseAllSessionCookies(cookieHeader: string | null): string[] {
  if (!cookieHeader) return [];
  const tokens: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== ETR_SESSION_COOKIE) continue;
    const value = decodeURIComponent(rest.join("=")).trim();
    if (value) tokens.push(value);
  }
  return tokens;
}

export type EtrCookieContext = {
  host?: string;
  protocol?: string;
};

function normalizeCookieHost(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  return trimmed.split(":")[0].toLowerCase();
}

/** OpenNext / wrangler preview 里 request.url 常不是浏览器 Host，须优先读请求头 */
function requestHostFromHeaders(request: Request): string {
  const hostHeader = normalizeCookieHost(request.headers.get("host"));
  // 本地 preview 时 x-forwarded-host 可能是 finance.info-quests.com，但浏览器 Host 仍是 127.0.0.1
  if (hostHeader && isLocalCookieHost(hostHeader)) return hostHeader;

  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const host = normalizeCookieHost(forwarded.split(",")[0]);
    if (host) return host;
  }
  if (hostHeader) return hostHeader;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refHost = normalizeCookieHost(new URL(referer).hostname);
      if (refHost) return refHost;
    } catch {
      /* ignore */
    }
  }
  try {
    return normalizeCookieHost(new URL(request.url).hostname);
  } catch {
    return "";
  }
}

function requestProtocolFromHeaders(request: Request): string {
  const hostHeader = normalizeCookieHost(request.headers.get("host"));
  if (hostHeader && isLocalCookieHost(hostHeader)) return "http:";

  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    const proto = forwarded.split(",")[0]?.trim().toLowerCase();
    if (proto === "http" || proto === "https") return `${proto}:`;
  }
  try {
    return new URL(request.url).protocol;
  } catch {
    return "https:";
  }
}

export function etrCookieContextFromRequest(request: Request): EtrCookieContext {
  const host = requestHostFromHeaders(request);
  const protocol = requestProtocolFromHeaders(request);
  if (!host) return { protocol };
  return { host, protocol };
}

function isLocalCookieHost(host: string): boolean {
  const h = normalizeCookieHost(host);
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

function hostMatchesCookieDomain(host: string, domain: string): boolean {
  const bare = domain.startsWith(".") ? domain.slice(1) : domain;
  const h = normalizeCookieHost(host);
  return h === bare || h.endsWith(`.${bare}`);
}

/** 跨子域名共享登录 Cookie（如 finance / food 共用 .info-quests.com） */
export function authCookieDomain(): string {
  const explicit = process.env.ETR_COOKIE_DOMAIN?.trim();
  if (explicit) {
    return explicit.startsWith(".") ? explicit : `.${explicit}`;
  }

  for (const raw of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_STORE_REVIEW_HOST,
  ]) {
    if (!raw) continue;
    try {
      const host = (
        raw.startsWith("http") ? new URL(raw).hostname : raw.split(":")[0]
      ).toLowerCase();
      if (
        !host ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".local")
      ) {
        continue;
      }
      const parts = host.split(".");
      if (parts.length >= 2) {
        return `.${parts.slice(-2).join(".")}`;
      }
    } catch {
      continue;
    }
  }
  return "";
}

function cookieDomainPart(ctx?: EtrCookieContext): string {
  if (ctx?.host && isLocalCookieHost(ctx.host)) return "";
  const domain = authCookieDomain();
  if (!domain || !ctx?.host || !hostMatchesCookieDomain(ctx.host, domain)) return "";
  return `; Domain=${domain}`;
}

function cookieSecurePart(ctx?: EtrCookieContext): string {
  if (ctx?.host && isLocalCookieHost(ctx.host)) return "";
  if (ctx?.protocol === "http:") return "";
  // wrangler preview 的 API Request 常拿不到 Host，此时不要强制 Secure
  if (!ctx?.host) return "";
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function sessionCookieHeader(
  token: string,
  expiresAt: Date,
  ctx?: EtrCookieContext
): string {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  return `${ETR_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieDomainPart(ctx)}${cookieSecurePart(ctx)}`;
}

export function clearSessionCookieHeader(ctx?: EtrCookieContext): string {
  return `${ETR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieDomainPart(ctx)}${cookieSecurePart(ctx)}`;
}

/** 清除 host-only 与跨子域两条 etr_session，避免旧 Cookie 干扰新登录 */
export function clearAllSessionCookieHeaders(ctx?: EtrCookieContext): string[] {
  const secure = cookieSecurePart(ctx);
  const base = `${ETR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const headers = [`${base}${secure}`];
  if (ctx?.host && isLocalCookieHost(ctx.host)) return headers;
  const domain = authCookieDomain();
  if (domain) {
    headers.push(`${base}; Domain=${domain}${secure}`);
  }
  return headers;
}

export function formatExpiresHint(role: EtrUserRole, locale: "en" | "zh"): string {
  if (role === "admin") {
    return locale === "zh" ? "登录有效期：6 个月" : "Session valid for 6 months";
  }
  if (role === "jp_vocab" || role === "en_vocab" || role === "ko_pron") {
    return locale === "zh" ? "登录有效期：30 天" : "Session valid for 30 days";
  }
  return locale === "zh" ? "登录有效期：7 天" : "Session valid for 7 days";
}
