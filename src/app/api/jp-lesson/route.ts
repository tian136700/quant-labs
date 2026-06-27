import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import {
  listJpLessons,
  updateJpLessonProgress,
  updateJpLessonTeacherAssignment,
} from "@/lib/jp-lesson-db";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import { listJpLessonNotes } from "@/lib/jp-lesson-note-db";
import { listJpLessonTeachers } from "@/lib/jp-lesson-teacher-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { listJpVocabRefs } from "@/lib/jp-vocab-db";
import type { JpLessonRecord } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

const VALID_PROGRESS: JpLessonProgressStatus[] = [
  "pending",
  "learning",
  "completed",
];

function parseProgressStatus(body: {
  progress_status?: unknown;
  completed?: unknown;
}): JpLessonProgressStatus | null {
  if (
    typeof body.progress_status === "string" &&
    VALID_PROGRESS.includes(body.progress_status as JpLessonProgressStatus)
  ) {
    return body.progress_status as JpLessonProgressStatus;
  }
  if (typeof body.completed === "boolean") {
    return body.completed ? "completed" : "pending";
  }
  return null;
}

function stripTeacherFromLessons(lessons: JpLessonRecord[]): JpLessonRecord[] {
  return lessons.map((lesson) => ({
    ...lesson,
    teacher_ids: [],
  }));
}

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const { isAdmin } = await requireAdmin(request);
    const [lessons, refs, notes] = await Promise.all([
      listJpLessons(env.DB),
      listJpVocabRefs(env.DB),
      listJpLessonNotes(env.DB),
    ]);
    const refsMap = Object.fromEntries(refs.map((r) => [r.ref_key, r]));

    if (isAdmin) {
      const teachers = await listJpLessonTeachers(env.DB);
      return jsonResponse({ ok: true, lessons, refs: refsMap, notes, teachers });
    }

    return jsonResponse({
      ok: true,
      lessons: stripTeacherFromLessons(lessons),
      refs: refsMap,
      notes,
    });
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
      action?: string;
      lesson_id?: number;
      progress_status?: JpLessonProgressStatus;
      completed?: boolean;
      teacher_id?: number | null;
      teacher_ids?: number[];
    };

    if (body.action === "set_teacher") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }

      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
      }

      const teacherIds =
        body.teacher_ids !== undefined
          ? body.teacher_ids
          : body.teacher_id === null || body.teacher_id === undefined
            ? []
            : [Number(body.teacher_id)];

      const result = await updateJpLessonTeacherAssignment(
        env.DB,
        lessonId,
        teacherIds
      );

      if (!result.ok) {
        const status =
          result.error === "not_found"
            ? 404
            : result.error === "teacher_not_found"
              ? 404
              : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true, lesson: result.lesson });
    }

    const lessonId = Number(body.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }

    const progressStatus = parseProgressStatus(body);
    if (!progressStatus) {
      return jsonResponse({ ok: false, error: "progress_status_invalid" }, 400);
    }

    const result = await updateJpLessonProgress(
      env.DB,
      lessonId,
      progressStatus,
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
