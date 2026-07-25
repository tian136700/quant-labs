import "server-only";

import {
  createEnLessonTeacher,
  listEnLessonTeachers,
} from "@/lib/en-lesson-teacher-db";
import {
  findEnLessonTeacherUserLink,
  setUserEnLessonTeacherLink,
} from "@/lib/etr-auth-db/teacher_links_en";
import { findUserById } from "@/lib/etr-auth-db";

/** 手动日程 / 人员管理里的「闲鱼英语抽查」老师显示名 */
export const XIANYU_EN_QUIZ_TEACHER_NAME = "闲鱼英语抽查";

/** 绑定到该老师的登录账号（抽完 +1h 禁；开课前 30min 启） */
export const XIANYU_EN_QUIZ_BOUND_USER_ID = 48;

/**
 * 确保英语老师「闲鱼英语抽查」存在，并绑定到用户 ID 48。
 * 用户不存在时只建老师、不报错（等账号建好后再跑即可）。
 */
export async function ensureXianyuEnQuizTeacherBound(
  db: D1Database
): Promise<{
  teacher_id: number | null;
  linked_user_id: number | null;
  created_teacher: boolean;
  linked: boolean;
}> {
  const teachers = await listEnLessonTeachers(db);
  let teacher = teachers.find(
    (t) => t.name.trim() === XIANYU_EN_QUIZ_TEACHER_NAME
  );
  let createdTeacher = false;
  if (!teacher) {
    const created = await createEnLessonTeacher(
      db,
      XIANYU_EN_QUIZ_TEACHER_NAME,
      0,
      null,
      null
    );
    if (!created.ok || !created.teacher) {
      return {
        teacher_id: null,
        linked_user_id: null,
        created_teacher: false,
        linked: false,
      };
    }
    teacher = created.teacher;
    createdTeacher = true;
  }

  const existingLink = await findEnLessonTeacherUserLink(db, teacher.id);
  if (existingLink && existingLink.user_id === XIANYU_EN_QUIZ_BOUND_USER_ID) {
    return {
      teacher_id: teacher.id,
      linked_user_id: existingLink.user_id,
      created_teacher: createdTeacher,
      linked: true,
    };
  }

  const user = await findUserById(db, XIANYU_EN_QUIZ_BOUND_USER_ID);
  if (!user) {
    return {
      teacher_id: teacher.id,
      linked_user_id: null,
      created_teacher: createdTeacher,
      linked: false,
    };
  }

  const link = await setUserEnLessonTeacherLink(
    db,
    XIANYU_EN_QUIZ_BOUND_USER_ID,
    teacher.id
  );
  return {
    teacher_id: teacher.id,
    linked_user_id: link.ok ? XIANYU_EN_QUIZ_BOUND_USER_ID : null,
    created_teacher: createdTeacher,
    linked: link.ok,
  };
}
