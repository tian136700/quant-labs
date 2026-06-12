import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Locale } from "@/i18n/messages";
import { clientIp, getLocalePref, setLocalePref } from "@/lib/locale-pref";
import type { CloudflareEnv } from "@/lib/types";

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!ip) {
    return json({ ok: true, locale: null });
  }

  try {
    const env = await getEnv();
    const locale = await getLocalePref(env.DB, ip);
    return json({ ok: true, locale });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message, locale: null }, 500);
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!ip) {
    return json({ ok: false, error: "Client IP unavailable" }, 400);
  }

  let body: { locale?: string };
  try {
    body = (await request.json()) as { locale?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (body.locale !== "zh" && body.locale !== "en") {
    return json({ ok: false, error: "locale must be zh or en" }, 400);
  }

  try {
    const env = await getEnv();
    await setLocalePref(env.DB, ip, body.locale as Locale);
    return json({ ok: true, locale: body.locale });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, 500);
  }
}

async function getEnv(): Promise<CloudflareEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cfEnv = env as CloudflareEnv;
    if (cfEnv?.DB) return cfEnv;
  } catch {
    /* 本地 next dev 无 Cloudflare 绑定时忽略 */
  }

  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] as never[] }),
          first: async () => null,
          run: async () => ({}),
        }),
      }),
      batch: async () => [],
    } as unknown as D1Database,
  };
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
