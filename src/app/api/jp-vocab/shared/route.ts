import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listJpVocabSharedToday } from "@/lib/jp-vocab-db";
import { requireJpVocabRead } from "@/lib/jp-vocab-auth";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const AUTH_MSG = {
  en: "Please log in to view shared words.",
  zh: "请登录后查看今日背单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const { items, refs } = await listJpVocabSharedToday(env.DB);
    return jsonResponse(
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
