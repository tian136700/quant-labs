import { getCloudflareContext } from "@opennextjs/cloudflare";
import { LS_LOCALE } from "@/i18n/messages";
import { LOCALE_HEADER, parseLocale } from "@/lib/locale-detect";
import { enableAnalyticsDevStore } from "@/lib/analytics-db";
import { enableEtrAuthDevStore } from "@/lib/etr-auth-db";
import { enableEtrLoginGuardDevStore } from "@/lib/etr-login-guard";
import { enableEtrLoginLinkDevStore } from "@/lib/etr-login-link-db";
import { enableRbacDevStore } from "@/lib/rbac-db";
import { enableEnglishTeacherReviewDevStore } from "@/lib/english-teacher-review-db";
import { enableFeedbackDevStore } from "@/lib/feedback-db";
import { enableJpLessonDevStore } from "@/lib/jp-lesson-db";
import { enableJpVocabDevStore } from "@/lib/jp-vocab-db";
import { enableStoreReviewDevStore } from "@/store-review/db";
import { enableTrendDevStore } from "@/lib/trend-db";
import { enableTrendBlogDevStore } from "@/lib/trend-blog-db";
import type { CloudflareEnv } from "@/lib/types";

function withLocalAuthEnv(cfEnv: CloudflareEnv): CloudflareEnv {
  return {
    ...cfEnv,
    ETR_ADMIN_USERNAME:
      cfEnv.ETR_ADMIN_USERNAME ?? process.env.ETR_ADMIN_USERNAME,
    ETR_ADMIN_PASSWORD:
      cfEnv.ETR_ADMIN_PASSWORD ?? process.env.ETR_ADMIN_PASSWORD,
    ETR_JP_VOCAB_USERNAME:
      cfEnv.ETR_JP_VOCAB_USERNAME ?? process.env.ETR_JP_VOCAB_USERNAME,
    ETR_JP_VOCAB_PASSWORD:
      cfEnv.ETR_JP_VOCAB_PASSWORD ?? process.env.ETR_JP_VOCAB_PASSWORD,
    ETR_JP_VOCAB_USER1_USERNAME:
      cfEnv.ETR_JP_VOCAB_USER1_USERNAME ??
      process.env.ETR_JP_VOCAB_USER1_USERNAME,
    ETR_JP_VOCAB_USER1_PASSWORD:
      cfEnv.ETR_JP_VOCAB_USER1_PASSWORD ??
      process.env.ETR_JP_VOCAB_USER1_PASSWORD,
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
  enableEtrLoginGuardDevStore();
  enableEtrLoginLinkDevStore();
  enableRbacDevStore();
  enableStoreReviewDevStore();
  enableFeedbackDevStore();
  enableAnalyticsDevStore();
  enableJpVocabDevStore();
  enableJpLessonDevStore();
  enableTrendDevStore();
  enableTrendBlogDevStore();
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
  const headerLocale = parseLocale(request.headers.get(LOCALE_HEADER));
  if (headerLocale) return headerLocale;

  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LS_LOCALE) {
      const saved = parseLocale(decodeURIComponent(rest.join("=")));
      if (saved) return saved;
    }
  }

  const ref = request.headers.get("referer") || "";
  try {
    const path = new URL(ref).pathname;
    if (path === "/zh" || path.startsWith("/zh/")) return "zh";
  } catch {
    /* ignore */
  }

  const accept = request.headers.get("accept-language") || "";
  if (/\bzh(-|;|,|$)/i.test(accept)) return "zh";

  return "en";
}
