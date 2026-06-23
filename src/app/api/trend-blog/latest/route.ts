import { verifyUploadAuth } from "@/lib/jp-review";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  getLatestTrendBlogPost,
  type TrendBlogLocale,
} from "@/lib/trend-blog-db";

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const url = new URL(request.url);
    const localeParam = url.searchParams.get("locale");
    const slug = (url.searchParams.get("slug") || "featured").trim() || "featured";

    const locale: TrendBlogLocale =
      localeParam === "zh" ? "zh" : localeParam === "en" ? "en" : "en";

    const post = await getLatestTrendBlogPost(env.DB, locale, slug);
    if (!post) {
      return jsonResponse({ ok: true, post: null });
    }

    return jsonResponse({ ok: true, post });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
