import { requireAdminOrUploadToken } from "@/lib/admin-or-upload-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import {
  createJpLessonManualSchedule,
  deleteJpLessonManualSchedule,
  listJpLessonManualSchedules,
  updateJpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule-db";
import type { JpLessonManualScheduleDraft } from "@/lib/jp-lesson-manual-schedule";

export async function GET(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const schedules = await listJpLessonManualSchedules(env.DB);
    return jsonResponse({ ok: true, schedules });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await request.json()) as {
      action?: string;
      id?: number;
      class_at?: string;
      duration_minutes?: number | null;
      title?: string;
      teacher?: string;
      note?: string;
    };

    const draft: JpLessonManualScheduleDraft = {
      class_at: typeof body.class_at === "string" ? body.class_at : "",
      duration_minutes:
        body.duration_minutes === null || body.duration_minutes === undefined
          ? null
          : Number(body.duration_minutes),
      title: typeof body.title === "string" ? body.title : "",
      teacher: typeof body.teacher === "string" ? body.teacher : "",
      note: typeof body.note === "string" ? body.note : "",
    };

    if (body.action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return jsonResponse({ ok: false, error: "schedule_id_invalid" }, 400);
      }

      const result = await updateJpLessonManualSchedule(env.DB, id, draft);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true, schedule: result.schedule });
    }

    const result = await createJpLessonManualSchedule(env.DB, draft);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse({ ok: true, schedule: result.schedule });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ ok: false, error: "schedule_id_invalid" }, 400);
    }

    const result = await deleteJpLessonManualSchedule(env.DB, id);
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
