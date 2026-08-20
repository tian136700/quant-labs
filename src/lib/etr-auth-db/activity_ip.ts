import "server-only";

import { ipKey, normalizeClientIp } from "@/lib/client-ip";
import { parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import { clientIp } from "@/lib/locale-pref";
import type { EtrUser } from "../etr-auth";
import { recordUserLoginHistory } from "./login_history";
import { ensureEtrUsersSchema } from "./schema";
import { etrAuthDbState, nowIso } from "./state";

/**
 * 抽查活跃写回 last_login_* 的最短间隔。
 * 同 IP 在窗口内跳过，避免 live 换词 / 勾选把 D1 打爆。
 */
export const USER_ACTIVITY_IP_THROTTLE_MS = 10 * 60 * 1000;

export type TouchUserActivityIpResult =
  | { touched: false; reason: "no_user" | "no_ip" | "throttled" }
  | { touched: true; ip_changed: boolean };

/**
 * 老师抽查时刷新「最近活跃」时间与 IP（复用 last_login_* 列，用户管理可见）。
 * - IP 变了：立刻写 + 追加历史行（可走归属地队列）
 * - 同 IP：距上次写入 ≥ 节流窗口才更新时间（不刷历史）
 */
export async function touchUserActivityIp(
  db: D1Database,
  userId: number,
  rawIp: string | null | undefined,
  opts?: { nowMs?: number }
): Promise<TouchUserActivityIpResult> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { touched: false, reason: "no_user" };
  }
  const ip = normalizeClientIp(rawIp) ?? (rawIp?.trim() || null);
  if (!ip) return { touched: false, reason: "no_ip" };

  const nowMs = opts?.nowMs ?? Date.now();
  const at = nowIso();

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((item) => item.id === userId);
    if (!row) return { touched: false, reason: "no_user" };
    const prevIp = ipKey(row.last_login_ip) || null;
    const nextKey = ipKey(ip) || ip;
    const ipChanged = prevIp !== nextKey;
    const prevAtMs = row.last_login_at
      ? parseStoredUtcDateTimeMs(row.last_login_at)
      : Number.NaN;
    if (
      !ipChanged &&
      Number.isFinite(prevAtMs) &&
      nowMs - prevAtMs < USER_ACTIVITY_IP_THROTTLE_MS
    ) {
      return { touched: false, reason: "throttled" };
    }
    row.last_login_at = at;
    row.last_login_ip = ip;
    if (ipChanged) {
      await recordUserLoginHistory(db, userId, at, ip);
    }
    return { touched: true, ip_changed: ipChanged };
  }

  await ensureEtrUsersSchema(db);
  const existing = await db
    .prepare(
      `SELECT last_login_at AS last_login_at, last_login_ip AS last_login_ip
       FROM etr_users WHERE id = ?1`
    )
    .bind(userId)
    .first<{ last_login_at: string | null; last_login_ip: string | null }>();
  if (!existing) return { touched: false, reason: "no_user" };

  const prevIp = ipKey(existing.last_login_ip) || null;
  const nextKey = ipKey(ip) || ip;
  const ipChanged = prevIp !== nextKey;
  const prevAtMs = existing.last_login_at
    ? parseStoredUtcDateTimeMs(existing.last_login_at)
    : Number.NaN;
  if (
    !ipChanged &&
    Number.isFinite(prevAtMs) &&
    nowMs - prevAtMs < USER_ACTIVITY_IP_THROTTLE_MS
  ) {
    return { touched: false, reason: "throttled" };
  }

  await db
    .prepare(
      `UPDATE etr_users
       SET last_login_at = ?1, last_login_ip = ?2
       WHERE id = ?3`
    )
    .bind(at, ip, userId)
    .run();

  if (ipChanged) {
    await recordUserLoginHistory(db, userId, at, ip);
  }

  return { touched: true, ip_changed: ipChanged };
}

/** 抽查路由用：从 Request 取 IP；失败只打日志，不挡主流程。 */
export async function touchAuthUserActivityIpFromRequest(
  db: D1Database,
  user: Pick<EtrUser, "id"> | null | undefined,
  request: Request
): Promise<void> {
  if (!user?.id) return;
  try {
    await touchUserActivityIp(db, user.id, clientIp(request));
  } catch (err) {
    console.error("[etr-auth] touchAuthUserActivityIpFromRequest failed", err);
  }
}
