import { requireAdminOrUploadToken } from "@/lib/admin-or-upload-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import type { JpLessonManualScheduleDraft } from "@/lib/jp-lesson-manual-schedule";
import { normalizeManualScheduleLinkedLessons } from "@/lib/jp-lesson-manual-schedule-linked";
import {
  createJpLessonManualScheduleMaybeRecurring,
  deleteJpLessonManualScheduleMaybeRecurring,
  listJpLessonManualSchedulesWithRecurring,
  pickManualScheduleForLinkedLessonSync,
  updateJpLessonManualScheduleMaybeRecurring,
} from "@/lib/jp-lesson-manual-schedule-recurring-db";
import { maybeEnableTeacherUsersForManualSchedule } from "@/lib/teacher-user-manual-schedule-enable";

export async function GET(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const schedules = await listJpLessonManualSchedulesWithRecurring(env.DB);
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
      linked_lessons?: unknown;
      recurring?: boolean;
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
      linked_lessons: normalizeManualScheduleLinkedLessons(body.linked_lessons),
      recurring: body.recurring === true,
    };

    if (body.action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return jsonResponse({ ok: false, error: "schedule_id_invalid" }, 400);
      }

      const result = await updateJpLessonManualScheduleMaybeRecurring(
        env.DB,
        id,
        draft
      );
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      const syncTarget = await pickManualScheduleForLinkedLessonSync(
        env.DB,
        result.schedule
      );

      let teacher_enable: unknown = null;
      try {
        teacher_enable = await maybeEnableTeacherUsersForManualSchedule(
          env.DB,
          syncTarget
        );
      } catch {
        teacher_enable = { triggered: false, reason: "enable_failed" };
      }

      return jsonResponse({
        ok: true,
        schedule: result.schedule,
        teacher_enable,
        rewritten_count:
          "rewritten_count" in result ? result.rewritten_count : undefined,
        recurring_id:
          "recurring_id" in result ? result.recurring_id : result.schedule.recurring_id,
      });
    }

    const result = await createJpLessonManualScheduleMaybeRecurring(
      env.DB,
      draft
    );
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    const syncTarget = await pickManualScheduleForLinkedLessonSync(
      env.DB,
      result.schedule
    );

    let teacher_enable: unknown = null;
    try {
      teacher_enable = await maybeEnableTeacherUsersForManualSchedule(
        env.DB,
        syncTarget
      );
    } catch {
      teacher_enable = { triggered: false, reason: "enable_failed" };
    }

    return jsonResponse({
      ok: true,
      schedule: result.schedule,
      teacher_enable,
      created_count: result.created_count,
      deduped: "deduped" in result ? result.deduped === true : false,
      recurring_id:
        "recurring_id" in result ? result.recurring_id : result.schedule.recurring_id,
    });
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

    const result = await deleteJpLessonManualScheduleMaybeRecurring(env.DB, id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({
      ok: true,
      recurring_id: "recurring_id" in result ? result.recurring_id : null,
      deleted_future: "deleted_future" in result ? result.deleted_future : 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
