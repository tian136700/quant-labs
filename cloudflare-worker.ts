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
const DEFAULT_ORIGIN = "https://finance.info-quests.com";

type CronEnv = {
  JP_REVIEW_UPLOAD_TOKEN?: string;
  SCHEDULE_CLASS_BARK_CRON_ORIGIN?: string;
};

async function runClassBarkRemind(env: CronEnv): Promise<void> {
  const token = (env.JP_REVIEW_UPLOAD_TOKEN || "").trim();
  if (!token) {
    console.error(
      "[schedule-class-bark-remind] skip: JP_REVIEW_UPLOAD_TOKEN missing"
    );
    return;
  }
  const origin = (
    env.SCHEDULE_CLASS_BARK_CRON_ORIGIN || DEFAULT_ORIGIN
  ).replace(/\/$/, "");
  const url = `${origin}${REMIND_PATH}`;
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
      console.error(
        `[schedule-class-bark-remind] HTTP ${res.status}: ${text.slice(0, 400)}`
      );
      return;
    }
    console.log(`[schedule-class-bark-remind] ok: ${text.slice(0, 400)}`);
  } catch (err) {
    console.error(
      "[schedule-class-bark-remind] fetch failed:",
      err instanceof Error ? err.message : err
    );
  }
}

export default {
  fetch: handler.fetch,

  async scheduled(
    _controller: { cron?: string },
    env: CronEnv,
    ctx: { waitUntil: (promise: Promise<unknown>) => void }
  ): Promise<void> {
    ctx.waitUntil(runClassBarkRemind(env));
  },
};
