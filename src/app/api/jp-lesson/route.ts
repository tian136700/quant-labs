import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import {
  incrementJpLessonLinkCopyCount,
  listJpLessons,
  updateJpLessonClassSchedules,
  updateJpLessonNextClassAt,
  updateJpLessonProgress,
  updateJpLessonTeacherAssignment,
} from "@/lib/jp-lesson-db";
import { deleteJpLesson } from "@/lib/jp-lesson-db-delete";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import { listJpLessonNotes } from "@/lib/jp-lesson-note-db";
import { listJpLessonTeachersWithLessonCounts } from "@/lib/jp-lesson-teacher-db";
import { requireJpLessonOperate, requireJpLessonRead } from "@/lib/jp-lesson-auth";
import { listJpVocabRefs } from "@/lib/jp-vocab-db";
import {
  maybeEnableTeacherUsersForLearningLesson,
  type TeacherUserLearningLessonEnableResult,
} from "@/lib/teacher-user-schedule-enable";
import type { JpLessonRecord } from "@/lib/types";

/** 学习中 + 开课 18h 内 → 尝试启用关联老师账号；失败不影响主保存。 */
async function tryEnableTeacherForLearningLesson(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<TeacherUserLearningLessonEnableResult | null> {
  try {
    return await maybeEnableTeacherUsersForLearningLesson(db, lesson);
  } catch {
    return null;
  }
}

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

function stripAdminOnlyFromLessons(lessons: JpLessonRecord[]): JpLessonRecord[] {
  return lessons.map((lesson) => ({
    ...lesson,
    teacher_ids: [],
    teacher_other: null,
    class_schedules: [],
    next_class_at: null,
    class_duration_minutes: null,
  }));
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const FORBIDDEN = {
    en: "You do not have permission to view Japanese lessons.",
    zh: "您没有日语新课的查看权限。",
  };

  try {
    const { env, user, allowed } = await requireJpLessonRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: FORBIDDEN[locale] }, 403);
    }

    const { isAdmin } = await requireAdmin(request);
    const [lessons, refs, notes] = await Promise.all([
      listJpLessons(env.DB),
      listJpVocabRefs(env.DB),
      listJpLessonNotes(env.DB),
    ]);
    const refsMap = Object.fromEntries(refs.map((r) => [r.ref_key, r]));

    if (isAdmin) {
      const teachers = await listJpLessonTeachersWithLessonCounts(env.DB);
      return jsonResponse({ ok: true, lessons, refs: refsMap, notes, teachers });
    }

    return jsonResponse({
      ok: true,
      lessons: stripAdminOnlyFromLessons(lessons),
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
    const body = (await request.json()) as {
      action?: string;
      lesson_id?: number;
      progress_status?: JpLessonProgressStatus;
      completed?: boolean;
      teacher_id?: number | null;
      teacher_ids?: number[];
      teacher_other?: string | null;
      next_class_at?: string | null;
      class_duration_minutes?: number | null;
      class_schedules?: Array<{
        class_at: string;
        duration_minutes: number | null;
      }>;
    };

    if (body.action === "record_link_copy") {
      const FORBIDDEN = {
        en: "You do not have permission to view Japanese lessons.",
        zh: "您没有日语新课的查看权限。",
      };
      const { env, allowed } = await requireJpLessonRead(request);
      if (!allowed) {
        return jsonResponse({ ok: false, error: FORBIDDEN[locale] }, 403);
      }

      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
      }

      const result = await incrementJpLessonLinkCopyCount(env.DB, lessonId);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true, link_copy_count: result.link_copy_count });
    }

    const { env, user, allowed } = await requireJpLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    if (body.action === "delete") {
      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
      }

      const result = await deleteJpLesson(env.DB, lessonId);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      return jsonResponse({ ok: true });
    }

    if (body.action === "set_next_class_at" || body.action === "set_class_schedules") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }

      const lessonId = Number(body.lesson_id);
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
      }

      if (Array.isArray(body.class_schedules)) {
        const result = await updateJpLessonClassSchedules(
          env.DB,
          lessonId,
          body.class_schedules.map((item) => ({
            class_at: String(item.class_at),
            duration_minutes:
              item.duration_minutes === null || item.duration_minutes === undefined
                ? null
                : Number(item.duration_minutes),
          }))
        );

        if (!result.ok) {
          const status =
            result.error === "not_found"
              ? 404
              : result.error === "class_at_invalid" ||
                  result.error === "class_duration_minutes_invalid"
                ? 400
                : 400;
          return jsonResponse({ ok: false, error: result.error }, status);
        }

        const teacher_auto_enable = await tryEnableTeacherForLearningLesson(
          env.DB,
          result.lesson
        );
        return jsonResponse({ ok: true, lesson: result.lesson, teacher_auto_enable });
      }

      const nextClassAt =
        body.next_class_at === undefined
          ? null
          : body.next_class_at === null
            ? null
            : String(body.next_class_at);

      const classDurationMinutes =
        body.class_duration_minutes === undefined
          ? undefined
          : body.class_duration_minutes === null
            ? null
            : Number(body.class_duration_minutes);

      const result = await updateJpLessonNextClassAt(
        env.DB,
        lessonId,
        nextClassAt,
        classDurationMinutes
      );

      if (!result.ok) {
        const status =
          result.error === "not_found"
            ? 404
            : result.error === "class_at_invalid" ||
                result.error === "class_duration_minutes_invalid" ||
                result.error === "next_class_at_invalid"
              ? 400
              : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }

      const teacher_auto_enable = await tryEnableTeacherForLearningLesson(
        env.DB,
        result.lesson
      );
      return jsonResponse({ ok: true, lesson: result.lesson, teacher_auto_enable });
    }

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

      const teacherOther =
        body.teacher_other === undefined
          ? undefined
          : body.teacher_other === null
            ? null
            : String(body.teacher_other);

      const result = await updateJpLessonTeacherAssignment(
        env.DB,
        lessonId,
        teacherIds,
        teacherOther
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

      const teacher_auto_enable = await tryEnableTeacherForLearningLesson(
        env.DB,
        result.lesson
      );
      return jsonResponse({ ok: true, lesson: result.lesson, teacher_auto_enable });
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

    const teacher_auto_enable = await tryEnableTeacherForLearningLesson(
      env.DB,
      result.lesson
    );
    return jsonResponse({ ok: true, lesson: result.lesson, teacher_auto_enable });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
