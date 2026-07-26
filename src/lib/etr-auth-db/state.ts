import "server-only";

import type { EtrSessionUser, EtrUser } from "../etr-auth";

export type DevUser = EtrUser & { password_hash: string };
export type DevSession = {
  token: string;
  user_id: number;
  expires_at: string;
  created_at: string;
};
export type DevLoginHistory = {
  id: number;
  user_id: number;
  login_at: string;
  login_ip: string | null;
};
export type DevIpGeoCache = {
  ip: string;
  country: string | null;
  country_code: string | null;
  prov: string | null;
  city: string | null;
  area: string | null;
  isp: string | null;
  ok: boolean;
  fetched_at: string;
};
export type LoginAuditMeta = { loginIp?: string | null };

export type AuthSessionResolve =
  | { status: "authenticated"; user: EtrSessionUser }
  | { status: "maintenance" }
  | { status: "anonymous"; staleCookie: boolean };

/** 模块级可变状态（dev store + bootstrap 一次性标记）。拆文件后统一经此对象读写。 */
export const etrAuthDbState = {
  devAuthEnabled: false,
  devUsers: [] as DevUser[],
  devSessions: [] as DevSession[],
  devLoginHistory: [] as DevLoginHistory[],
  devIpGeoCache: [] as DevIpGeoCache[],
  devUserIdSeq: 1,
  devLoginHistoryIdSeq: 1,
  /** 同一 Worker 实例内只 bootstrap 一次，避免每次鉴权都跑 PBKDF2 */
  bootstrapUsersDone: false,
};

export function enableEtrAuthDevStore() {
  etrAuthDbState.devAuthEnabled = true;
}

export function isUserDisabled(
  user: Pick<EtrUser, "disabled"> | null | undefined
): boolean {
  return (user?.disabled ?? 0) !== 0;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function expiresIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
