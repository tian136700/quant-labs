import { requireAdminOrUploadToken } from "@/lib/admin-or-upload-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import {
  ingestScheduleChatDraft,
  type ScheduleChatIngestInput,
} from "@/lib/schedule-chat-ingest";

/**
 * Telegram / Mac：自然语言解析后的字段写入手动日程。
 * 鉴权：管理员 Cookie 或 Bearer JP_REVIEW_UPLOAD_TOKEN。
 */
export async function POST(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await request.json()) as Partial<ScheduleChatIngestInput>;

    const input: ScheduleChatIngestInput = {
      class_at: typeof body.class_at === "string" ? body.class_at : "",
      title: typeof body.title === "string" ? body.title : "",
      teacher: typeof body.teacher === "string" ? body.teacher : "",
      duration_minutes:
        body.duration_minutes === null || body.duration_minutes === undefined
          ? null
          : Number(body.duration_minutes),
      note: typeof body.note === "string" ? body.note : "",
      teacher_pick_id:
        body.teacher_pick_id === null || body.teacher_pick_id === undefined
          ? null
          : Number(body.teacher_pick_id),
      create_if_missing: body.create_if_missing !== false,
    };

    const result = await ingestScheduleChatDraft(env.DB, input);

    if (!result.ok) {
      if ("candidates" in result) {
        return jsonResponse(
          {
            ok: false,
            error: result.error,
            candidates: result.candidates,
          },
          409
        );
      }
      if (result.error === "schedule_already_exists" && "schedule" in result) {
        return jsonResponse(
          {
            ok: false,
            error: result.error,
            schedule: result.schedule,
          },
          409
        );
      }
      const status =
        result.error === "draft_invalid" ||
        result.error === "teacher_pick_invalid" ||
        result.error === "teacher_not_found" ||
        result.error === "name_empty"
          ? 400
          : result.error === "name_duplicate"
            ? 409
            : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({
      ok: true,
      schedule: result.schedule,
      teacher: result.teacher,
      created_teacher: result.created_teacher,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
