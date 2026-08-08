import "server-only";

import { sendBarkPush } from "@/lib/bark-push";
import type { CloudflareEnv } from "@/lib/types";

export const JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN = 7;
export const JP_LESSON_AI_PLAN_PROMPT_BARK_ROW_ID = "pending";
export const JP_LESSON_AI_PLAN_PROMPT_BARK_GROUP = "日语新课";

let schemaReady = false;

export async function ensureJpLessonAiPlanPromptBarkSchema(
  db: D1Database
): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_lesson_ai_plan_prompt_bark (
         id TEXT PRIMARY KEY,
         token TEXT,
         fire_at TEXT,
         fire_display TEXT,
         delay_min INTEGER,
         last_copied_at TEXT,
         last_copied_display TEXT,
         lesson_id INTEGER,
         course_label TEXT,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  schemaReady = true;
}

export function clampJpLessonAiPlanPromptBarkDelayMin(
  raw: unknown
): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    return JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN;
  }
  if (n > 120) return 120;
  return Math.floor(n);
}

/** 北京时间口语展示，对齐 STT format_beijing_now */
export function formatJpLessonAiPlanPromptBarkBeijing(
  dt: Date = new Date()
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const year = get("year");
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  if (minute === 0) {
    return `${year}年${month}月${day}日 ${hour}点整（北京时间）`;
  }
  return `${year}年${month}月${day}日 ${hour}点${minute}分（北京时间）`;
}

function newToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export type JpLessonAiPlanPromptBarkMeta = {
  last_copied_at: string;
  last_copied_display: string;
  lesson_id: number | null;
  course_label: string;
  notify_pending: boolean;
  notify_fire_at: string;
  notify_fire_display: string;
  notify_delay_min: number;
};

type Row = {
  token: string | null;
  fire_at: string | null;
  fire_display: string | null;
  delay_min: number | null;
  last_copied_at: string | null;
  last_copied_display: string | null;
  lesson_id: number | null;
  course_label: string | null;
};

async function loadRow(db: D1Database): Promise<Row | null> {
  await ensureJpLessonAiPlanPromptBarkSchema(db);
  return (
    (await db
      .prepare(
        `SELECT token, fire_at, fire_display, delay_min, last_copied_at,
                last_copied_display, lesson_id, course_label
         FROM jp_lesson_ai_plan_prompt_bark WHERE id = ?`
      )
      .bind(JP_LESSON_AI_PLAN_PROMPT_BARK_ROW_ID)
      .first<Row>()) || null
  );
}

function metaFromRow(row: Row | null): JpLessonAiPlanPromptBarkMeta {
  const delay =
    row?.delay_min != null && Number.isFinite(row.delay_min)
      ? Math.floor(row.delay_min)
      : JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN;
  return {
    last_copied_at: row?.last_copied_at || "",
    last_copied_display: row?.last_copied_display || "",
    lesson_id:
      row?.lesson_id != null && Number.isFinite(row.lesson_id)
        ? Math.floor(row.lesson_id)
        : null,
    course_label: (row?.course_label || "").trim(),
    notify_pending: Boolean(row?.token && row?.fire_at),
    notify_fire_at: row?.fire_at || "",
    notify_fire_display: row?.fire_display || "",
    notify_delay_min: delay,
  };
}

export async function getJpLessonAiPlanPromptBarkMeta(
  db: D1Database
): Promise<JpLessonAiPlanPromptBarkMeta> {
  return metaFromRow(await loadRow(db));
}

async function upsertRow(
  db: D1Database,
  fields: {
    token: string | null;
    fire_at: string | null;
    fire_display: string | null;
    delay_min: number | null;
    last_copied_at: string;
    last_copied_display: string;
    lesson_id: number | null;
    course_label: string | null;
  }
): Promise<void> {
  await ensureJpLessonAiPlanPromptBarkSchema(db);
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR REPLACE INTO jp_lesson_ai_plan_prompt_bark (
         id, token, fire_at, fire_display, delay_min,
         last_copied_at, last_copied_display, lesson_id, course_label, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      JP_LESSON_AI_PLAN_PROMPT_BARK_ROW_ID,
      fields.token,
      fields.fire_at,
      fields.fire_display,
      fields.delay_min,
      fields.last_copied_at,
      fields.last_copied_display,
      fields.lesson_id,
      fields.course_label,
      nowIso
    )
    .run();
}

export type RecordJpLessonAiPlanPromptCopiedInput = {
  scheduleBark?: boolean;
  delayMin?: number;
  lessonId?: number | null;
  courseLabel?: string | null;
};

export type RecordJpLessonAiPlanPromptCopiedResult =
  JpLessonAiPlanPromptBarkMeta & {
    ok: true;
    scheduled?: boolean;
    skipped?: boolean;
    reason?: string;
  };

/**
 * 记下复制时间；scheduleBark=true 时预约 delay 分钟后推送（覆盖旧预约）。
 * scheduleBark=false 时取消未到期预约。
 */
export async function recordJpLessonAiPlanPromptCopied(
  db: D1Database,
  input: RecordJpLessonAiPlanPromptCopiedInput = {}
): Promise<RecordJpLessonAiPlanPromptCopiedResult> {
  const now = new Date();
  const lastCopiedAt = now.toISOString();
  const lastCopiedDisplay = formatJpLessonAiPlanPromptBarkBeijing(now);
  const lessonId =
    input.lessonId != null && Number.isFinite(input.lessonId)
      ? Math.floor(input.lessonId)
      : null;
  const courseLabel = (input.courseLabel || "").trim() || null;

  if (!input.scheduleBark) {
    await upsertRow(db, {
      token: null,
      fire_at: null,
      fire_display: null,
      delay_min: null,
      last_copied_at: lastCopiedAt,
      last_copied_display: lastCopiedDisplay,
      lesson_id: lessonId,
      course_label: courseLabel,
    });
    return {
      ok: true,
      ...metaFromRow(await loadRow(db)),
    };
  }

  const delayMin = clampJpLessonAiPlanPromptBarkDelayMin(input.delayMin);
  const fireAt = new Date(now.getTime() + delayMin * 60_000);
  const token = newToken();
  const fireDisplay = formatJpLessonAiPlanPromptBarkBeijing(fireAt);

  await upsertRow(db, {
    token,
    fire_at: fireAt.toISOString(),
    fire_display: fireDisplay,
    delay_min: delayMin,
    last_copied_at: lastCopiedAt,
    last_copied_display: lastCopiedDisplay,
    lesson_id: lessonId,
    course_label: courseLabel,
  });

  return {
    ok: true,
    scheduled: true,
    ...metaFromRow(await loadRow(db)),
  };
}

export type FireJpLessonAiPlanPromptBarkResult = {
  ok: boolean;
  fired?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  notified?: number;
};

/** Cron：到期且 token 仍有效则推 Bark（active + paymentsuccess，禁止 critical/call） */
export async function fireDueJpLessonAiPlanPromptBark(
  env: CloudflareEnv
): Promise<FireJpLessonAiPlanPromptBarkResult> {
  const db = env.DB;
  const row = await loadRow(db);
  if (!row?.token || !row.fire_at) {
    return { ok: true, skipped: true, reason: "none_pending", notified: 0 };
  }

  const fireMs = Date.parse(row.fire_at);
  if (!Number.isFinite(fireMs) || fireMs > Date.now()) {
    return { ok: true, skipped: true, reason: "not_due", notified: 0 };
  }

  const deviceKey = (env.BARK_DEVICE_KEY || "").trim();
  if (!deviceKey) {
    return {
      ok: true,
      skipped: true,
      reason: "BARK_DEVICE_KEY not configured",
      notified: 0,
    };
  }

  const copied = (row.last_copied_display || "").trim();
  const courseLabel = (row.course_label || "").trim();
  const lessonId =
    row.lesson_id != null && Number.isFinite(row.lesson_id)
      ? Math.floor(row.lesson_id)
      : null;
  const delayMin =
    row.delay_min != null && Number.isFinite(row.delay_min)
      ? Math.floor(row.delay_min)
      : JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN;

  const title = "日语教案图可能已做好";
  const lines = [
    "页面：日语新课 · AI 教案提示词",
    courseLabel ? `课次：${courseLabel}` : null,
    lessonId != null ? `课 ID：${lessonId}` : null,
    `结果：复制 AI 提示词后约 ${delayMin} 分钟，图片教案可能已生成，可回来粘贴保存`,
    `上次复制：${copied || "（未记录）"}`,
  ].filter(Boolean) as string[];

  // 先清 pending，避免 Cron 重入双推；推送失败也视为已消费（与 STT token 一次性一致）
  await upsertRow(db, {
    token: null,
    fire_at: null,
    fire_display: null,
    delay_min: null,
    last_copied_at: row.last_copied_at || new Date().toISOString(),
    last_copied_display: row.last_copied_display || "",
    lesson_id: lessonId,
    course_label: courseLabel || null,
  });

  const result = await sendBarkPush({
    deviceKey,
    title,
    body: lines.join("\n"),
    group: JP_LESSON_AI_PLAN_PROMPT_BARK_GROUP,
    level: "active",
    sound: "paymentsuccess",
    server: (env.BARK_SERVER || "").trim() || undefined,
  });

  if (result.skipped) {
    return {
      ok: true,
      skipped: true,
      reason: result.reason || "bark_not_configured",
      notified: 0,
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "bark push failed",
      notified: 0,
    };
  }
  return { ok: true, fired: true, notified: 1 };
}
