import "server-only";

import {
  BARK_ICON_CLASS_REMIND,
  formatClassRemindPush,
  sendBarkPush,
} from "@/lib/bark-push";
import { parseBeijingDateTime } from "@/lib/jp-lesson-shared";
import { listScheduleCalDavEvents } from "@/lib/schedule-caldav-events";
import type { CloudflareEnv } from "@/lib/types";

export const SCHEDULE_CLASS_BARK_DEFAULT_LEADS = [10, 5, 1] as const;
const SENT_RETENTION_DAYS = 14;

let schemaReady = false;

export async function ensureBarkClassRemindSentSchema(
  db: D1Database
): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS bark_class_remind_sent (
         id TEXT PRIMARY KEY,
         sent_at TEXT NOT NULL
       )`
    )
    .run();
  schemaReady = true;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** MM-DD HH:MM in a given IANA zone */
function formatMmDdHm(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function parseLeadMinutes(raw: string | null | undefined): number[] {
  const parts = String(raw || "")
    .replace(/，/g, ",")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const leads: number[] = [];
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (!Number.isFinite(n) || n < 1 || leads.includes(n)) continue;
    leads.push(n);
  }
  if (!leads.length) {
    return [...SCHEDULE_CLASS_BARK_DEFAULT_LEADS];
  }
  return leads.sort((a, b) => b - a);
}

export function sentKey(uid: string, lead: number): string {
  return `${uid}#${lead}`;
}

async function loadSentIds(
  db: D1Database,
  keys: string[]
): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const out = new Set<string>();
  // D1 单次 bind 数量有限；分批 IN 查询
  const chunkSize = 40;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const row = await db
      .prepare(
        `SELECT id FROM bark_class_remind_sent WHERE id IN (${placeholders})`
      )
      .bind(...chunk)
      .all<{ id: string }>();
    for (const r of row.results || []) {
      if (r.id) out.add(r.id);
    }
  }
  return out;
}

async function markSent(db: D1Database, id: string, sentAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO bark_class_remind_sent (id, sent_at) VALUES (?, ?)`
    )
    .bind(id, sentAt)
    .run();
}

async function pruneSent(db: D1Database, nowIso: string): Promise<void> {
  const cutoffMs =
    Date.parse(nowIso) - SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(cutoffMs)) return;
  const cutoff = new Date(cutoffMs).toISOString();
  await db
    .prepare(`DELETE FROM bark_class_remind_sent WHERE sent_at < ?`)
    .bind(cutoff)
    .run();
}

export type ScheduleClassBarkRemindResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  notified: number;
  leads: number[];
  details: Array<{
    uid: string;
    lead: number;
    summary: string;
    ok: boolean;
    error?: string;
  }>;
  error?: string;
};

/**
 * 按北京时间课表：开课前 10/5/1 分钟各推一次（critical + 持续铃响）。
 * 正文展示泰国时间（Asia/Bangkok ≈ 北京 − 1h）。
 */
export async function runScheduleClassBarkRemind(
  env: CloudflareEnv,
  options?: {
    dryRun?: boolean;
    forceUid?: string | null;
    forceLead?: number | null;
    leadMinutes?: number[];
  }
): Promise<ScheduleClassBarkRemindResult> {
  const deviceKey = (env.BARK_DEVICE_KEY || "").trim();
  if (!deviceKey && !options?.dryRun) {
    return {
      ok: true,
      skipped: true,
      reason: "BARK_DEVICE_KEY not configured",
      notified: 0,
      leads: [],
      details: [],
    };
  }

  await ensureBarkClassRemindSentSchema(env.DB);
  const now = new Date();
  const nowIso = now.toISOString();
  await pruneSent(env.DB, nowIso);

  const leads =
    options?.leadMinutes?.length
      ? [...options.leadMinutes].sort((a, b) => b - a)
      : parseLeadMinutes(env.SCHEDULE_CLASS_BARK_LEAD_MINUTES);
  const maxLeadSec = Math.max(...leads) * 60;

  const forceUid = (options?.forceUid || "").trim() || null;
  const forceLead =
    options?.forceLead != null && options.forceLead > 0
      ? options.forceLead
      : null;

  const events = await listScheduleCalDavEvents(env.DB);
  type Candidate = {
    uid: string;
    summary: string;
    teachers: string;
    title: string;
    classAt: string;
    start: Date;
    secondsUntil: number;
  };
  const candidates: Candidate[] = [];
  for (const event of events) {
    const uid = String(event.uid || "").trim();
    const classAt = String(event.class_at || "").trim();
    if (!uid || !classAt) continue;
    const start = parseBeijingDateTime(classAt);
    if (!start) continue;
    const secondsUntil = (start.getTime() - now.getTime()) / 1000;
    const isForced = forceUid != null && uid === forceUid;
    // 常规只关心最大档位内的课；force_uid 试推可绕过时间窗
    if (!isForced && (secondsUntil <= 0 || secondsUntil > maxLeadSec + 60)) {
      continue;
    }
    candidates.push({
      uid,
      summary: String(event.summary || "上课").trim() || "上课",
      teachers: String(event.teachers || "").trim(),
      title: String(event.title || "").trim(),
      classAt,
      start,
      secondsUntil,
    });
  }
  candidates.sort((a, b) => a.secondsUntil - b.secondsUntil);

  const pendingKeys: string[] = [];
  for (const c of candidates) {
    for (const lead of leads) {
      pendingKeys.push(sentKey(c.uid, lead));
    }
  }
  const alreadySent = await loadSentIds(env.DB, pendingKeys);

  const details: ScheduleClassBarkRemindResult["details"] = [];
  let notified = 0;
  const dryRun = Boolean(options?.dryRun);
  const icon =
    (env.BARK_ICON_CLASS_REMIND || "").trim() || BARK_ICON_CLASS_REMIND;

  for (const c of candidates) {
    const bjLabel = formatMmDdHm(c.start, "Asia/Shanghai");
    const thLabel = formatMmDdHm(c.start, "Asia/Bangkok");

    for (let index = 0; index < leads.length; index++) {
      const lead = leads[index]!;
      const nextLead = leads[index + 1] ?? 0;
      const lower = nextLead * 60;
      const upper = lead * 60;
      const inWindow = lower < c.secondsUntil && c.secondsUntil <= upper;
      const forced =
        forceUid != null &&
        c.uid === forceUid &&
        (forceLead == null || forceLead === lead);
      if (!inWindow && !forced) continue;

      const key = sentKey(c.uid, lead);
      if (alreadySent.has(key) && !forced) continue;

      const { title, body } = formatClassRemindPush({
        minutesLeft: lead,
        summary: c.summary,
        thailandClassAtLabel: thLabel,
        beijingClassAtLabel: bjLabel,
        teachers: c.teachers,
        lessonTitle: c.title,
      });

      if (dryRun) {
        details.push({ uid: c.uid, lead, summary: c.summary, ok: true });
        notified += 1;
        continue;
      }

      const result = await sendBarkPush({
        deviceKey,
        title,
        body,
        group: "上课提醒",
        level: "critical",
        call: true,
        icon,
        server: (env.BARK_SERVER || "").trim() || undefined,
      });
      if (result.skipped) {
        return {
          ok: true,
          skipped: true,
          reason: result.reason || "bark_not_configured",
          notified,
          leads,
          details,
        };
      }
      if (!result.ok) {
        details.push({
          uid: c.uid,
          lead,
          summary: c.summary,
          ok: false,
          error: result.error,
        });
        return {
          ok: false,
          error: result.error || "bark push failed",
          notified,
          leads,
          details,
        };
      }

      if (inWindow) {
        await markSent(env.DB, key, nowIso);
        alreadySent.add(key);
      }
      details.push({ uid: c.uid, lead, summary: c.summary, ok: true });
      notified += 1;
    }
  }

  return { ok: true, notified, leads, details };
}
