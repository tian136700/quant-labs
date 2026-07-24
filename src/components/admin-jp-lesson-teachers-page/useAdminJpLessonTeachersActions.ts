"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import {
  DEFAULT_HOURLY_LESSON_MINUTES,
  mapCreateTeacherUserError,
  resolveLessonMinutesForSave,
} from "@/components/admin-jp-lesson-teachers-page/admin-jp-lesson-teachers-page-helpers";
import {
  normalizeJpLessonTeacher,
  resolveLessonTeacherRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  removeJpLessonTeacherCache,
  upsertJpLessonTeacherCache,
} from "@/lib/jp-lesson-teachers-cache";
import { teachersApiBase } from "@/lib/lesson-teacher-subject";
import type { LessonTeacherSubject } from "@/lib/locale-path";
import type { JpLessonTeacher } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export type UseAdminJpLessonTeachersActionsOptions = {
  locale: Locale;
  teacherSubject: LessonTeacherSubject;
  teachers: JpLessonTeacher[];
  saving: boolean;
  editingId: number | null;
  editName: string;
  editHourlyRate: string;
  editLessonMinutes: string;
  editSortOrder: number;
  newName: string;
  newHourlyRate: string;
  newLessonMinutes: string;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setStatusErr: Dispatch<SetStateAction<boolean>>;
  setTeachers: Dispatch<SetStateAction<JpLessonTeacher[]>>;
  setNewName: Dispatch<SetStateAction<string>>;
  setNewHourlyRate: Dispatch<SetStateAction<string>>;
  setNewLessonMinutes: Dispatch<SetStateAction<string>>;
  setAddModalOpen: Dispatch<SetStateAction<boolean>>;
  setEditingId: Dispatch<SetStateAction<number | null>>;
  setEditName: Dispatch<SetStateAction<string>>;
  setEditHourlyRate: Dispatch<SetStateAction<string>>;
  setEditLessonMinutes: Dispatch<SetStateAction<string>>;
  setEditSortOrder: Dispatch<SetStateAction<number>>;
  setCreatingUserTeacherId: Dispatch<SetStateAction<number | null>>;
};

export function useAdminJpLessonTeachersActions(
  options: UseAdminJpLessonTeachersActionsOptions
) {
  const {
    locale,
    teacherSubject,
    teachers,
    saving,
    editingId,
    editName,
    editHourlyRate,
    editLessonMinutes,
    editSortOrder,
    newName,
    newHourlyRate,
    newLessonMinutes,
    setSaving,
    setStatus,
    setStatusErr,
    setTeachers,
    setNewName,
    setNewHourlyRate,
    setNewLessonMinutes,
    setAddModalOpen,
    setEditingId,
    setEditName,
    setEditHourlyRate,
    setEditLessonMinutes,
    setEditSortOrder,
    setCreatingUserTeacherId,
  } = options;

  const createTeacher = async () => {
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch(teachersApiBase(teacherSubject), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          hourly_rate: newHourlyRate.trim() ? Number(newHourlyRate) : null,
          lesson_minutes: resolveLessonMinutesForSave(
            newHourlyRate,
            newLessonMinutes,
            null
          ),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        teacher?: JpLessonTeacher;
        renamed_teachers?: JpLessonTeacher[];
        user_account?: {
          id: number;
          username: string;
          password: string;
          disabled: boolean;
        };
      };
      if (!data.ok) {
        setStatus(
          data.error === "name_duplicate" ? "老师名称已存在" : data.error || "添加失败"
        );
        setStatusErr(true);
        return;
      }
      if (data.teacher) {
        const teacher = normalizeJpLessonTeacher(data.teacher);
        if (teacherSubject === "jp") {
          for (const item of data.renamed_teachers ?? []) {
            upsertJpLessonTeacherCache(normalizeJpLessonTeacher(item));
          }
          upsertJpLessonTeacherCache(teacher);
          setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
        } else {
          setTeachers((prev) => [...prev.filter((item) => item.id !== teacher.id), teacher]);
        }
      }
      setNewName("");
      setNewHourlyRate("");
      setNewLessonMinutes("");
      setAddModalOpen(false);
      if (data.user_account) {
        rememberAdminUserPassword(data.user_account.id, data.user_account.password);
        setStatus(
          locale === "zh"
            ? `已添加。已自动创建禁用账号：${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                locale
              )}（请在用户管理中启用后再登录）`
            : `Added. Auto-created disabled account: ${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                locale
              )} (enable in Users before login)`
        );
      } else {
        setStatus(locale === "zh" ? "已添加" : "Added");
      }
      setStatusErr(false);
    } catch {
      setStatus("添加失败");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (teacher: JpLessonTeacher) => {
    const resolved = resolveLessonTeacherRateFields(teacher);
    setEditingId(teacher.id);
    setEditName(resolved.name);
    setEditHourlyRate(
      resolved.hourly_rate != null ? String(resolved.hourly_rate) : ""
    );
    setEditLessonMinutes(
      resolved.lesson_minutes != null
        ? String(resolved.lesson_minutes)
        : resolved.hourly_rate != null
          ? String(DEFAULT_HOURLY_LESSON_MINUTES)
          : ""
    );
    setEditSortOrder(teacher.sort_order);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditHourlyRate("");
    setEditLessonMinutes("");
    setEditSortOrder(0);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const original = teachers.find((t) => t.id === editingId);
    if (!original) return;
    const baseline = resolveLessonTeacherRateFields(original);
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch(teachersApiBase(teacherSubject), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          name: editName,
          hourly_rate: editHourlyRate.trim()
            ? Number(editHourlyRate)
            : baseline.hourly_rate,
          lesson_minutes: resolveLessonMinutesForSave(
            editHourlyRate,
            editLessonMinutes,
            baseline.lesson_minutes
          ),
          sort_order: editSortOrder,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: JpLessonTeacher;
        error?: string;
      };
      if (!data.ok) {
        setStatus(
          data.error === "name_duplicate" ? "老师名称已存在" : data.error || "保存失败"
        );
        setStatusErr(true);
        return;
      }
      if (data.teacher) {
        const teacher = normalizeJpLessonTeacher(data.teacher);
        if (teacherSubject === "jp") {
          upsertJpLessonTeacherCache(teacher);
          setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
        } else {
          setTeachers((prev) => prev.map((item) => (item.id === teacher.id ? teacher : item)));
        }
      }
      cancelEdit();
      setStatus("已保存");
      setStatusErr(false);
    } catch {
      setStatus("保存失败");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const deleteTeacher = async (id: number, name: string) => {
    if (!confirm(`确定删除「${name}」？已关联的新课将变为未指定。`)) return;
    try {
      const res = await fetch(`${teachersApiBase(teacherSubject)}?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || "删除失败");
        setStatusErr(true);
        return;
      }
      if (editingId === id) cancelEdit();
      if (teacherSubject === "jp") {
        removeJpLessonTeacherCache(id);
      }
      setTeachers((prev) => prev.filter((teacher) => teacher.id !== id));
      setStatus("已删除");
      setStatusErr(false);
    } catch {
      setStatus("删除失败");
      setStatusErr(true);
    }
  };



  const createTeacherUser = async (teacher: JpLessonTeacher) => {
    if (teacherSubject === "en") return;
    const isKo = teacherSubject === "ko";
    const ok = window.confirm(
      locale === "zh"
        ? isKo
          ? `为「${teacher.name}」一键创建韩语教师账号？\n用户名将按老师名拼音生成，密码为易记的英文词组组合。\n开课前 30 分钟自动启用；抽完最后一个字母后 20 分钟自动禁用。`
          : `为「${teacher.name}」一键创建日语教师账号？\n用户名将按老师名拼音生成（如李老师 → LiLaoshi），密码为易记的英文词组组合。`
        : isKo
          ? `Create a Korean-teacher account for "${teacher.name}"?\nUsername will be pinyin; password is a memorable word combo.\nAuto-enable 30min before class; disable 20min after last letter.`
          : `Create a Japanese-teacher account for "${teacher.name}"?\nUsername will be pinyin (e.g. LiLaoshi); password is a memorable word combo.`
    );
    if (!ok) return;

    setCreatingUserTeacherId(teacher.id);
    setStatus("");
    setStatusErr(false);
    try {
      const apiBase = teachersApiBase(teacherSubject);
      const res = await fetch(apiBase, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_user", id: teacher.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: boolean;
        user?: { id: number; username: string; disabled: boolean };
        password?: string;
        error?: string;
      };
      if (!data.ok || !data.user) {
        const err = data.error ?? "create failed";
        setStatus(mapCreateTeacherUserError(String(err), locale));
        setStatusErr(true);
        return;
      }

      const linkedUser = { id: data.user.id, username: data.user.username };
      setTeachers((prev) =>
        prev.map((item) =>
          item.id === teacher.id ? { ...item, linked_user: linkedUser } : item
        )
      );
      if (data.password) {
        rememberAdminUserPassword(data.user.id, data.password);
      }

      const creds =
        data.password != null
          ? formatAdminUserCredentials(
              data.user.username,
              data.password,
              locale
            )
          : data.user.username;

      setStatus(
        data.created
          ? locale === "zh"
            ? `已创建并关联账号：${creds}`
            : `Account created and linked: ${creds}`
          : locale === "zh"
            ? `已关联已有账号：${data.user.username}`
            : `Linked existing account: ${data.user.username}`
      );
      setStatusErr(false);
    } catch {
      setStatus(locale === "zh" ? "创建账号失败" : "Failed to create account");
      setStatusErr(true);
    } finally {
      setCreatingUserTeacherId(null);
    }
  };

  const closeAddModal = useCallback(() => {
    if (saving) return;
    setAddModalOpen(false);
  }, [saving]);


  return {
    createTeacher,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteTeacher,
    createTeacherUser,
    closeAddModal,
  };
}
