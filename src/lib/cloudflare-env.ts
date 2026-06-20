import { getCloudflareContext } from "@opennextjs/cloudflare";
import { enableAnalyticsDevStore } from "@/lib/analytics-db";
import { enableEtrAuthDevStore } from "@/lib/etr-auth-db";
import { enableEnglishTeacherReviewDevStore } from "@/lib/english-teacher-review-db";
import { enableFeedbackDevStore } from "@/lib/feedback-db";
import { enableJpVocabDevStore } from "@/lib/jp-vocab-db";
import { enableStoreReviewDevStore } from "@/store-review/db";
import type { CloudflareEnv } from "@/lib/types";

function withLocalAuthEnv(cfEnv: CloudflareEnv): CloudflareEnv {
  return {
    ...cfEnv,
    ETR_ADMIN_USERNAME:
      cfEnv.ETR_ADMIN_USERNAME ?? process.env.ETR_ADMIN_USERNAME,
    ETR_ADMIN_PASSWORD:
      cfEnv.ETR_ADMIN_PASSWORD ?? process.env.ETR_ADMIN_PASSWORD,
    JP_REVIEW_UPLOAD_TOKEN:
      cfEnv.JP_REVIEW_UPLOAD_TOKEN ?? process.env.JP_REVIEW_UPLOAD_TOKEN,
    JP_REVIEW_DOWNLOAD_KEY:
      cfEnv.JP_REVIEW_DOWNLOAD_KEY ?? process.env.JP_REVIEW_DOWNLOAD_KEY,
  };
}

export async function getCloudflareEnv(): Promise<CloudflareEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cfEnv = env as CloudflareEnv;
    if (cfEnv?.DB) return withLocalAuthEnv(cfEnv);
  } catch {
    /* 本地 next dev 无 Cloudflare 绑定时使用内存存储 */
  }

  enableEnglishTeacherReviewDevStore();
  enableEtrAuthDevStore();
  enableStoreReviewDevStore();
  enableFeedbackDevStore();
  enableAnalyticsDevStore();
  enableJpVocabDevStore();
  return withLocalAuthEnv({
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] as never[] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
        }),
      }),
      batch: async () => [],
    } as unknown as D1Database,
  });
}

export function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  extraHeaders?: HeadersInit
) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function localeFromRequest(request: Request): "en" | "zh" {
  const ref = request.headers.get("referer") || "";
  try {
    const path = new URL(ref).pathname;
    if (path === "/zh" || path.startsWith("/zh/")) return "zh";
  } catch {
    /* ignore */
  }
  return "en";
}
