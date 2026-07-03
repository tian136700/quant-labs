import { requireAdmin } from "@/lib/admin-auth";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { provisionJpLessonTeacherUser } from "@/lib/etr-auth-db";
import {
  createJpLessonTeacher,
  deleteJpLessonTeacher,
  listJpLessonTeachers,
  updateJpLessonTeacher,
} from "@/lib/jp-lesson-teacher-db";

export async function GET(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const teachers = await listJpLessonTeachers(env.DB);
    return jsonResponse({ ok: true, teachers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await request.json()) as {
      action?: string;
      id?: number;
      name?: string;
      sort_order?: number;
    };

    if (body.action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return jsonResponse({ ok: false, error: "teacher_id_invalid" }, 400);
      }

      const result = await updateJpLessonTeacher(env.DB, id, {
        name: body.name,
        sort_order:
          body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      });

      if (!result.ok) {
        const status =
          result.error === "not_found"
            ? 404
            : result.error === "name_duplicate"
              ? 409
              : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true, teacher: result.teacher });
    }

    const name = typeof body.name === "string" ? body.name : "";
    const sortOrder =
      body.sort_order !== undefined ? Number(body.sort_order) : 0;

    const result = await createJpLessonTeacher(env.DB, name, sortOrder);
    if (!result.ok) {
      const status = result.error === "name_duplicate" ? 409 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    const userProvision = await provisionJpLessonTeacherUser(env, result.teacher.name);

    return jsonResponse({
      ok: true,
      teacher: result.teacher,
      user_account:
        userProvision.ok && userProvision.created
          ? {
              id: userProvision.user.id,
              username: userProvision.user.username,
              password: userProvision.password,
              disabled: true,
            }
          : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ ok: false, error: "teacher_id_invalid" }, 400);
    }

    const result = await deleteJpLessonTeacher(env.DB, id);
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
