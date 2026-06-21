import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listJpLessons, updateJpLessonCompleted } from "@/lib/jp-lesson-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { listJpVocabRefs } from "@/lib/jp-vocab-db";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export async function GET() {
  try {
    const env = await getCloudflareEnv();
    const [lessons, refs] = await Promise.all([
      listJpLessons(env.DB),
      listJpVocabRefs(env.DB),
    ]);
    const refsMap = Object.fromEntries(refs.map((r) => [r.ref_key, r]));
    return jsonResponse({ ok: true, lessons, refs: refsMap });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      lesson_id?: number;
      completed?: boolean;
    };

    const lessonId = Number(body.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }
    if (typeof body.completed !== "boolean") {
      return jsonResponse({ ok: false, error: "completed_invalid" }, 400);
    }

    const result = await updateJpLessonCompleted(
      env.DB,
      lessonId,
      body.completed,
      user.username
    );

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true, lesson: result.lesson });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
