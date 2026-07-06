import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  createJpLessonNote,
  deleteJpLessonNote,
  updateJpLessonNote,
} from "@/lib/jp-lesson-note-db";
import { requireJpLessonOperate } from "@/lib/jp-lesson-auth";

const AUTH_MSG = {
  en: "Please log in to save notes.",
  zh: "请登录后再编辑课堂笔记。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      lesson_id?: number;
      item_word?: string;
      body?: string;
    };

    const lessonId = Number(body.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }

    const result = await createJpLessonNote(
      env.DB,
      lessonId,
      String(body.item_word ?? ""),
      String(body.body ?? ""),
      user.username
    );

    if (!result.ok) {
      const status =
        result.error === "lesson_not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true, note: result.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function PATCH(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      note_id?: number;
      body?: string;
    };

    const noteId = Number(body.note_id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      return jsonResponse({ ok: false, error: "note_id_invalid" }, 400);
    }

    const result = await updateJpLessonNote(
      env.DB,
      noteId,
      String(body.body ?? "")
    );

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true, note: result.note });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as { note_id?: number };
    const noteId = Number(body.note_id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      return jsonResponse({ ok: false, error: "note_id_invalid" }, 400);
    }

    const result = await deleteJpLessonNote(env.DB, noteId);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
