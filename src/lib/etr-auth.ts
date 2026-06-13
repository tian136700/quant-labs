/** 默认管理员用户名（密码必须通过环境变量 ETR_ADMIN_PASSWORD 配置，勿写入 Git） */
export const ETR_DEFAULT_ADMIN_USERNAME = "Admin";

export const ETR_SESSION_COOKIE = "etr_session";

/** Admin 登录有效期：半年 */
export const ETR_ADMIN_SESSION_MS = 180 * 24 * 60 * 60 * 1000;
/** 普通用户登录有效期：7 天 */
export const ETR_USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type EtrUserRole = "admin" | "user";

export interface EtrUser {
  id: number;
  username: string;
  role: EtrUserRole;
  created_at: string;
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
  return role === "admin" ? ETR_ADMIN_SESSION_MS : ETR_USER_SESSION_MS;
}

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export function isValidUsername(username: string): boolean {
  if (username.length < 6 || username.length > 32) return false;
  return /^[\w\u4e00-\u9fff.-]+$/u.test(username);
}

export function isReservedUsername(
  username: string,
  adminUsername = ETR_DEFAULT_ADMIN_USERNAME
): boolean {
  return username.toLowerCase() === adminUsername.toLowerCase();
}

export type AdminBootstrap = {
  username: string;
  password: string;
};

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

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ETR_SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ETR_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ETR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function formatExpiresHint(role: EtrUserRole, locale: "en" | "zh"): string {
  if (role === "admin") {
    return locale === "zh" ? "登录有效期：6 个月" : "Session valid for 6 months";
  }
  return locale === "zh" ? "登录有效期：7 天" : "Session valid for 7 days";
}
