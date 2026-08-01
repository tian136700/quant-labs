import { requireAdminOrUploadToken } from "@/lib/admin-or-upload-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import {
  createEnLessonTeacher,
  deleteEnLessonTeacher,
  getEnLessonTeacherById,
  listEnLessonTeachersWithLessonCounts,
  updateEnLessonTeacher,
} from "@/lib/en-lesson-teacher-db";
import { normalizeTencentMeetingId } from "@/lib/en-lesson-tencent-meeting";
import { ensureEnLessonTeacherUserAccount, listEnLessonTeacherUserLinkMapByTeacherId } from "@/lib/etr-auth-db";
import { ensureXianyuEnQuizTeacherBound } from "@/lib/en-xianyu-quiz-teacher";
import {
  normalizeTeacherLessonMinutes,
  resolveLessonTeacherHourlyRateInput,
  splitTeacherNameAndRate,
} from "@/lib/jp-lesson-teacher-rate";

function resolveTeacherNameAndRate(body: {
  name?: string;
  hourly_rate?: unknown;
  lesson_price?: unknown;
  lesson_minutes?: unknown;
}): {
  name: string;
  hourly_rate: number | null | undefined;
  lesson_minutes: number | null | undefined;
} {
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  let hourlyRate = resolveLessonTeacherHourlyRateInput(body);
  let lessonMinutes =
    body.lesson_minutes !== undefined
      ? normalizeTeacherLessonMinutes(body.lesson_minutes)
      : undefined;
  let name = rawName;

  if (hourlyRate === undefined && rawName) {
    const split = splitTeacherNameAndRate(rawName);
    if (split.hourly_rate != null) {
      name = split.name;
      hourlyRate = split.hourly_rate;
      if (lessonMinutes === undefined && split.lesson_minutes != null) {
        lessonMinutes = split.lesson_minutes;
      }
    }
  }

  return { name, hourly_rate: hourlyRate, lesson_minutes: lessonMinutes };
}

export async function GET(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    try {
      await ensureXianyuEnQuizTeacherBound(env.DB);
    } catch (ensureErr) {
      console.error("[en-lesson-teachers] ensureXianyuEnQuizTeacherBound", ensureErr);
    }
    const teachers = await listEnLessonTeachersWithLessonCounts(env.DB);
    const linkMap = await listEnLessonTeacherUserLinkMapByTeacherId(env.DB);
    return jsonResponse({
      ok: true,
      teachers: teachers.map((teacher) => {
        const link = linkMap.get(teacher.id);
        return {
          ...teacher,
          linked_user: link
            ? { id: link.user_id, username: link.username }
            : null,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { env, allowed, viaUploadToken } = await requireAdminOrUploadToken(
      request
    );
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const body = (await request.json()) as {
      action?: string;
      id?: number;
      name?: string;
      sort_order?: number;
      hourly_rate?: number | null;
      lesson_price?: number;
      lesson_minutes?: number;
      tencent_meeting_id?: string | null;
    };

    if (viaUploadToken && body.action) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    if (body.action === "create_user") {
      const teacherId = Number(body.id);
      if (!Number.isInteger(teacherId) || teacherId <= 0) {
        return jsonResponse({ ok: false, error: "teacher_id_invalid" }, 400);
      }
      const teacher = await getEnLessonTeacherById(env.DB, teacherId);
      if (!teacher) {
        return jsonResponse({ ok: false, error: "not_found" }, 404);
      }
      const teacherName = (teacher.name ?? "").trim();
      if (!teacherName) {
        return jsonResponse({ ok: false, error: "teacher_name_empty" }, 400);
      }
      const result = await ensureEnLessonTeacherUserAccount(
        env,
        teacherId,
        teacherName
      );
      if (!result.ok) {
        const status =
          result.error === "user_exists" || result.error === "username_taken"
            ? 409
            : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }
      return jsonResponse({
        ok: true,
        created: result.created,
        user: {
          id: result.user.id,
          username: result.user.username,
          disabled: (result.user.disabled ?? 0) !== 0,
        },
        password: result.password,
      });
    }

    if (body.action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return jsonResponse({ ok: false, error: "teacher_id_invalid" }, 400);
      }

      const { name, hourly_rate: hourlyRate, lesson_minutes: lessonMinutes } =
        resolveTeacherNameAndRate(body);

      const result = await updateEnLessonTeacher(env.DB, id, {
        name: body.name !== undefined ? name : undefined,
        sort_order:
          body.sort_order !== undefined ? Number(body.sort_order) : undefined,
        hourly_rate: hourlyRate,
        lesson_minutes: lessonMinutes,
        tencent_meeting_id:
          body.tencent_meeting_id !== undefined
            ? normalizeTencentMeetingId(body.tencent_meeting_id)
            : undefined,
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

    const { name, hourly_rate: hourlyRate, lesson_minutes: lessonMinutes } =
      resolveTeacherNameAndRate(body);
    const sortOrder =
      body.sort_order !== undefined ? Number(body.sort_order) : 0;

    const result = await createEnLessonTeacher(
      env.DB,
      name,
      sortOrder,
      hourlyRate ?? null,
      lessonMinutes ?? null,
      body.tencent_meeting_id !== undefined
        ? normalizeTencentMeetingId(body.tencent_meeting_id)
        : null
    );
    if (!result.ok) {
      const status = result.error === "name_duplicate" ? 409 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    // 英语老师可建登录账号（开课前 30min 启 / 抽完 +1h 禁）
    return jsonResponse({
      ok: true,
      teacher: result.teacher,
      renamed_teachers: result.renamed_teachers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { env, allowed, viaUploadToken } = await requireAdminOrUploadToken(
      request
    );
    if (!allowed || viaUploadToken) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ ok: false, error: "teacher_id_invalid" }, 400);
    }

    const result = await deleteEnLessonTeacher(env.DB, id);
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
