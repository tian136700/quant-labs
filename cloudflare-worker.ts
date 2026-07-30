/**
 * OpenNext Custom Worker：保留 Next fetch，并增加 Cron scheduled。
 * @see https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * 本地测 Cron：
 *   npx wrangler dev --test-scheduled
 *   curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
 *
 * 注意：本文件已从 tsconfig exclude，避免 next build 做类型检查。
 */

// @ts-expect-error `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

const REMIND_PATH = "/api/admin/schedule-class-bark-remind";
/** 开课前启用老师账号（日语 2h / 韩英 30min）；每 10 分钟一次，不依赖 Mac */
const PRE_CLASS_ENABLE_PATH = "/api/admin/teacher-user-pre-class-enable";
/** 北京 05/06/07：今日有课启用；补 Mac launchd 漏跑 / 1102 */
const SCHEDULE_ENABLE_PATH = "/api/admin/teacher-user-schedule-enable";
const DEFAULT_ORIGIN = "https://finance.info-quests.com";

type CronEnv = {
  JP_REVIEW_UPLOAD_TOKEN?: string;
  SCHEDULE_CLASS_BARK_CRON_ORIGIN?: string;
};

function beijingHourMinute(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // en-GB 偶发 24:xx 表示午夜
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return { hour, minute };
}

async function isOriginRateLimited(origin: string): Promise<boolean> {
  try {
    const probe = await fetch(`${origin}/`, {
      method: "GET",
      headers: {
        Accept: "text/html",
      },
    });
    const body = (await probe.text()).slice(0, 800).toLowerCase();
    return (
      probe.status === 429 ||
      body.includes("error 1027") ||
      body.includes("temporarily rate limited")
    );
  } catch {
    return true;
  }
}

async function postAdminCronJob(
  env: CronEnv,
  path: string,
  label: string
): Promise<void> {
  const origin = (
    env.SCHEDULE_CLASS_BARK_CRON_ORIGIN || DEFAULT_ORIGIN
  ).replace(/\/$/, "");
  if (await isOriginRateLimited(origin)) {
    console.error(`[${label}] skip: origin unavailable/rate-limited`);
    return;
  }

  const token = (env.JP_REVIEW_UPLOAD_TOKEN || "").trim();
  if (!token) {
    console.error(`[${label}] skip: JP_REVIEW_UPLOAD_TOKEN missing`);
    return;
  }

  const url = `${origin}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[${label}] HTTP ${res.status}: ${text.slice(0, 400)}`);
      return;
    }
    console.log(`[${label}] ok: ${text.slice(0, 400)}`);
  } catch (err) {
    console.error(
      `[${label}] fetch failed:`,
      err instanceof Error ? err.message : err
    );
  }
}

async function runClassBarkRemind(env: CronEnv): Promise<void> {
  await postAdminCronJob(env, REMIND_PATH, "schedule-class-bark-remind");
}

/** 开课前启用：每 10 分钟（与 Mac StartInterval=600 同频；双跑幂等） */
async function runTeacherPreClassEnable(env: CronEnv): Promise<void> {
  await postAdminCronJob(
    env,
    PRE_CLASS_ENABLE_PATH,
    "teacher-user-pre-class-enable"
  );
}

/** 今日有课启用：北京 05/06/07 整点各一次 */
async function runTeacherScheduleEnable(env: CronEnv): Promise<void> {
  await postAdminCronJob(
    env,
    SCHEDULE_ENABLE_PATH,
    "teacher-user-schedule-enable"
  );
}

export default {
  fetch: handler.fetch,

  async scheduled(
    _controller: { cron?: string },
    env: CronEnv,
    ctx: { waitUntil: (promise: Promise<unknown>) => void }
  ): Promise<void> {
    const { hour, minute } = beijingHourMinute();
    ctx.waitUntil(runClassBarkRemind(env));
    // 老师开号：不依赖本机 launchd（漏装 / Mac 睡眠 / 早上 1102 仍能开）
    if (minute % 10 === 0) {
      ctx.waitUntil(runTeacherPreClassEnable(env));
    }
    if ((hour === 5 || hour === 6 || hour === 7) && minute === 0) {
      ctx.waitUntil(runTeacherScheduleEnable(env));
    }
  },
};
