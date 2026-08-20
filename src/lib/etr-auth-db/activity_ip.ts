import "server-only";

import { ipKey, normalizeClientIp } from "@/lib/client-ip";
import { parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import { clientIp } from "@/lib/locale-pref";
import type { EtrUser } from "../etr-auth";
import { recordUserLoginHistory } from "./login_history";
import { ensureEtrUsersSchema } from "./schema";
import { etrAuthDbState, nowIso } from "./state";

/**
 * 活跃 IP：同一北京自然日 + 同 IP → 跳过（一天记一次即可）。
 * 保留常量名供回归脚本识别；语义是「按日」而非毫秒窗口。
 */
export const USER_ACTIVITY_IP_THROTTLE_MS = 24 * 60 * 60 * 1000;

export type TouchUserActivityIpResult =
  | { touched: false; reason: "no_user" | "no_ip" | "throttled" }
  | { touched: true; ip_changed: boolean };

function beijingYmdFromMs(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * 老师进站 / 抽查时刷新「最近活跃」时间与 IP（复用 last_login_*，用户管理可见）。
 * - 不必重新登录：有会话进站即可
 * - 同 IP 且同北京日：跳过（今天记一次）
 * - IP 变了：立刻写 + 追加历史行（归属地队列照旧）
 * - 跨北京日：再记一次（更新时间与 IP）
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
  const todayYmd = beijingYmdFromMs(nowMs);

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((item) => item.id === userId);
    if (!row) return { touched: false, reason: "no_user" };
    const prevIp = ipKey(row.last_login_ip) || null;
    const nextKey = ipKey(ip) || ip;
    const ipChanged = prevIp !== nextKey;
    const prevAtMs = row.last_login_at
      ? parseStoredUtcDateTimeMs(row.last_login_at)
      : Number.NaN;
    const prevYmd = Number.isFinite(prevAtMs) ? beijingYmdFromMs(prevAtMs) : null;
    if (!ipChanged && prevYmd === todayYmd) {
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
  const prevYmd = Number.isFinite(prevAtMs) ? beijingYmdFromMs(prevAtMs) : null;
  if (!ipChanged && prevYmd === todayYmd) {
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

/** 进站 / 抽查路由用：从 Request 取 IP；失败只打日志，不挡主流程。 */
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
