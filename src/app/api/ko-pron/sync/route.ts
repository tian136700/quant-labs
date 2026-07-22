import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireKoPronRead } from "@/lib/ko-pron-auth";
import {
  getKoPronTeacherVisibleLimit,
  listKoPronLettersChangedSince,
} from "@/lib/ko-pron-db";

const READ_AUTH_MSG = {
  en: "Please log in to view letters.",
  zh: "请登录后查看字母。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const url = new URL(request.url);
  const since = url.searchParams.get("since")?.trim() ?? "";
  const includeLimit = url.searchParams.get("limit") !== "0";

  try {
    const { env, allowed } = await requireKoPronRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }

    const [letters, teacher_visible_limit] = await Promise.all([
      since ? listKoPronLettersChangedSince(env.DB, since) : Promise.resolve([]),
      includeLimit
        ? getKoPronTeacherVisibleLimit(env.DB)
        : Promise.resolve(null),
    ]);

    return jsonResponse(
      {
        ok: true,
        letters,
        words: letters,
        ...(teacher_visible_limit ? { teacher_visible_limit } : {}),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
