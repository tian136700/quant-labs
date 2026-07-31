import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  createJpLessonNote,
  deleteJpLessonNote,
  listJpLessonNotesByLessonId,
  updateJpLessonNote,
} from "@/lib/jp-lesson-note-db";
import { requireJpLessonOperate, requireJpLessonRead } from "@/lib/jp-lesson-auth";

const AUTH_MSG = {
  en: "Please log in to save notes.",
  zh: "请登录后再编辑课堂笔记。",
};

const READ_FORBIDDEN = {
  en: "You do not have permission to view Japanese lessons.",
  zh: "您没有日语新课的查看权限。",
};

/** 按课拉取笔记正文（列表 GET /api/jp-lesson 只给 note_counts，正文走这里） */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpLessonRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_FORBIDDEN[locale] }, 403);
    }

    const url = new URL(request.url);
    const lessonId = Number(url.searchParams.get("lesson_id"));
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }

    const notes = await listJpLessonNotesByLessonId(env.DB, lessonId);
    return jsonResponse({ ok: true, lesson_id: lessonId, notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

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
