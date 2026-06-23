import { verifyUploadAuth } from "@/lib/jp-review";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  normalizeTrendBlogPublishInput,
  publishTrendBlogPost,
} from "@/lib/trend-blog-db";

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const locale = form.get("locale");
      const slug = form.get("slug");
      const title = form.get("title");
      const headline = form.get("headline");
      const metaDescription = form.get("meta_description");
      const author = form.get("author");
      const publishedAt = form.get("published_at");
      const readMinutes = form.get("read_minutes");
      const tagsRaw = form.get("tags");
      const contentFile = form.get("content_file");
      const contentHtmlField = form.get("content_html");

      let contentHtml = "";
      if (contentFile instanceof File && contentFile.size > 0) {
        contentHtml = await contentFile.text();
      } else if (typeof contentHtmlField === "string") {
        contentHtml = contentHtmlField;
      }

      let tags: string[] | undefined;
      if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        try {
          const parsed = JSON.parse(tagsRaw) as unknown;
          if (Array.isArray(parsed)) {
            tags = parsed.filter((x): x is string => typeof x === "string");
          } else {
            tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
          }
        } catch {
          tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      body = {
        locale,
        slug,
        title,
        headline,
        meta_description: metaDescription,
        author,
        published_at: publishedAt,
        read_minutes: readMinutes,
        tags,
        content_html: contentHtml,
      };
    } else {
      try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== "object") {
          return jsonResponse({ ok: false, error: "Payload must be an object" }, 400);
        }
        body = parsed as Record<string, unknown>;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
      }
    }

    const normalized = normalizeTrendBlogPublishInput(body);
    if ("error" in normalized) {
      return jsonResponse({ ok: false, error: normalized.error }, 400);
    }

    const result = await publishTrendBlogPost(env.DB, normalized);
    return jsonResponse({
      ok: true,
      id: result.id,
      locale: result.locale,
      slug: result.slug,
      updated_at: result.updated_at,
      public_url:
        result.locale === "zh"
          ? `/zh/trend-blog`
          : `/trend-blog`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
