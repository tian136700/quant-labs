"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useCallback } from "react";
import type { AdminUserEditRow } from "@/components/AdminUserEditModal";
import type { UserRow } from "@/components/admin-users-page/admin-users-page-helpers";
import {
  formatAdminUserCredentials,
  readAdminUserPassword,
  rememberAdminUserPassword,
  forgetAdminUserPassword,
} from "@/lib/admin-user-credentials";
import { hasAdminUserFieldErrors } from "@/lib/admin-user-validation";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  ETR_DEFAULT_JP_VOCAB_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USER1_USERNAME,
  ETR_DEFAULT_ADMIN_USERNAME,
  isReservedUsername,
} from "@/lib/etr-auth";
import { renderAdminTemplateCredentialsCopy } from "@/lib/login-link-template-render";
import { emptyTeacherModules, type RbacTeacherModules } from "@/lib/rbac";
import type { LoginLinkTemplate } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export type UseAdminUsersPageActionsOptions = {
  locale: Locale;
  users: UserRow[];
  selectedTemplateId: number | null;
  newUsername: string;
  newPassword: string;
  newTeacherModules: RbacTeacherModules;
  newTeacherId: number | null;
  addUserSubmitErrors: ReturnType<typeof import("@/lib/admin-user-validation").adminUserFieldErrors>;
  editingTemplateId: number | null;
  editTemplateName: string;
  editTemplateBody: string;
  newTemplateName: string;
  newTemplateBody: string;
  persistUsers: (next: UserRow[]) => void;
  loadTemplates: () => void | Promise<void>;
  loadTeachers: () => void | Promise<void>;
  setUsers: Dispatch<SetStateAction<UserRow[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setStatusErr: Dispatch<SetStateAction<boolean>>;
  setCopyToast: Dispatch<SetStateAction<string | null>>;
  setAddUserModalError: Dispatch<SetStateAction<string>>;
  setAddUserSubmitAttempted: Dispatch<SetStateAction<boolean>>;
  setNewTeacherId: Dispatch<SetStateAction<number | null>>;
  setAddUserOpen: Dispatch<SetStateAction<boolean>>;
  setNewTeacherModules: Dispatch<SetStateAction<RbacTeacherModules>>;
  setEditingUser: Dispatch<SetStateAction<UserRow | null>>;
  setBindingUser: Dispatch<SetStateAction<UserRow | null>>;
  setTemplateSaving: Dispatch<SetStateAction<boolean>>;
  setNewTemplateName: Dispatch<SetStateAction<string>>;
  setNewTemplateBody: Dispatch<SetStateAction<string>>;
  setSelectedTemplateId: Dispatch<SetStateAction<number | null>>;
  setEditingTemplateId: Dispatch<SetStateAction<number | null>>;
  setEditTemplateName: Dispatch<SetStateAction<string>>;
  setEditTemplateBody: Dispatch<SetStateAction<string>>;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setNewUsername: Dispatch<SetStateAction<string>>;
  setNewPassword: Dispatch<SetStateAction<string>>;
  setLinkGeneratingId: Dispatch<SetStateAction<number | null>>;
  setLinkGeneratingWithTemplate: Dispatch<SetStateAction<boolean>>;
  setCopyingId: Dispatch<SetStateAction<number | null>>;
  setResettingId: Dispatch<SetStateAction<number | null>>;
  setDeletingId: Dispatch<SetStateAction<number | null>>;
};

export function useAdminUsersPageActions(options: UseAdminUsersPageActionsOptions) {
  const {
    locale,
    users,
    selectedTemplateId,
    newUsername,
    newPassword,
    newTeacherModules,
    newTeacherId,
    addUserSubmitErrors,
    editingTemplateId,
    editTemplateName,
    editTemplateBody,
    newTemplateName,
    newTemplateBody,
    persistUsers,
    loadTemplates,
    loadTeachers,
    setUsers,
    setStatus,
    setStatusErr,
    setCopyToast,
    setAddUserModalError,
    setAddUserSubmitAttempted,
    setNewTeacherId,
    setAddUserOpen,
    setNewTeacherModules,
    setEditingUser,
    setBindingUser,
    setTemplateSaving,
    setNewTemplateName,
    setNewTemplateBody,
    setSelectedTemplateId,
    setEditingTemplateId,
    setEditTemplateName,
    setEditTemplateBody,
    setCreating,
    setNewUsername,
    setNewPassword,
    setLinkGeneratingId,
    setLinkGeneratingWithTemplate,
    setCopyingId,
    setResettingId,
    setDeletingId,
  } = options;

  const openAddUserModal = () => {
    setAddUserModalError("");
    setAddUserSubmitAttempted(false);
    setNewTeacherId(null);
    setAddUserOpen(true);
    void loadTeachers();
  };

  const closeAddUserModal = () => {
    setAddUserOpen(false);
    setAddUserModalError("");
    setAddUserSubmitAttempted(false);
    setNewTeacherId(null);
    setNewTeacherModules(emptyTeacherModules());
  };

  const openEditUser = (row: UserRow) => {
    setEditingUser(row);
    void loadTeachers();
  };

  const openBindTeacher = (row: UserRow) => {
    setBindingUser(row);
    void loadTeachers();
  };


  const createTemplate = async () => {
    setTemplateSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/login-link-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName,
          body: newTemplateBody,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        template?: LoginLinkTemplate;
        error?: string;
      };
      if (!data.ok) {
        setStatus(
          data.error === "name_empty" || data.error === "body_empty"
            ? locale === "zh"
              ? "请填写模板名称与正文"
              : "Name and body are required"
            : String(data.error || "failed")
        );
        setStatusErr(true);
        return;
      }
      setNewTemplateName("");
      setNewTemplateBody("");
      setStatus(locale === "zh" ? "已添加文字模板" : "Template added");
      if (data.template) {
        setSelectedTemplateId(data.template.id);
      }
      void loadTemplates();
    } catch {
      setStatus(locale === "zh" ? "添加模板失败" : "Failed to add template");
      setStatusErr(true);
    } finally {
      setTemplateSaving(false);
    }
  };

  const startEditTemplate = (template: LoginLinkTemplate) => {
    setEditingTemplateId(template.id);
    setEditTemplateName(template.name);
    setEditTemplateBody(template.body);
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setEditTemplateName("");
    setEditTemplateBody("");
  };

  const saveEditTemplate = async () => {
    if (editingTemplateId == null) return;
    setTemplateSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/login-link-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingTemplateId,
          name: editTemplateName,
          body: editTemplateBody,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(
          data.error === "name_empty" || data.error === "body_empty"
            ? locale === "zh"
              ? "请填写模板名称与正文"
              : "Name and body are required"
            : String(data.error || "failed")
        );
        setStatusErr(true);
        return;
      }
      cancelEditTemplate();
      setStatus(locale === "zh" ? "已保存文字模板" : "Template saved");
      void loadTemplates();
    } catch {
      setStatus(locale === "zh" ? "保存模板失败" : "Failed to save template");
      setStatusErr(true);
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (template: LoginLinkTemplate) => {
    const ok = window.confirm(
      locale === "zh"
        ? `确定删除模板「${template.name}」？`
        : `Delete template "${template.name}"?`
    );
    if (!ok) return;
    try {
      const res = await fetch(
        `/api/admin/login-link-templates?id=${template.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(String(data.error || "failed"));
        setStatusErr(true);
        return;
      }
      if (selectedTemplateId === template.id) {
        setSelectedTemplateId(null);
      }
      setStatus(locale === "zh" ? "已删除文字模板" : "Template deleted");
      void loadTemplates();
    } catch {
      setStatus(locale === "zh" ? "删除模板失败" : "Failed to delete template");
      setStatusErr(true);
    }
  };

  const toggleDisabled = (row: UserRow) => {
    const snapshot = row;
    const nextDisabled = !row.disabled;
    setStatus("");
    setStatusErr(false);
    setUsers((prev) => {
      const next = prev.map((item) =>
        item.id === row.id ? { ...item, disabled: nextDisabled } : item
      );
      persistUsers(next);
      return next;
    });
    setStatus(
      locale === "zh"
        ? nextDisabled
          ? `已禁用：${row.username}`
          : `已启用：${row.username}`
        : nextDisabled
          ? `Disabled: ${row.username}`
          : `Enabled: ${row.username}`
    );

    void (async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: row.id, disabled: nextDisabled }),
        });
        const data = await res.json();
        if (!data.ok || !data.user) {
          throw new Error(String(data.error || "save failed"));
        }
        setUsers((prev) => {
          const next = prev.map((item) =>
            item.id === row.id ? { ...item, ...data.user } : item
          );
          persistUsers(next);
          return next;
        });
      } catch (err) {
        setUsers((prev) => {
          const next = prev.map((item) => (item.id === row.id ? snapshot : item));
          persistUsers(next);
          return next;
        });
        setStatus(
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "操作失败"
              : "Update failed"
        );
        setStatusErr(true);
      }
    })();
  };

  const toggleNeverDisable = (row: UserRow) => {
    const snapshot = row;
    const nextNeverDisable = !row.never_disable;
    setStatus("");
    setStatusErr(false);
    setUsers((prev) => {
      const next = prev.map((item) =>
        item.id === row.id ? { ...item, never_disable: nextNeverDisable } : item
      );
      persistUsers(next);
      return next;
    });
    setStatus(
      locale === "zh"
        ? nextNeverDisable
          ? `已设为永不禁用：${row.username}`
          : `已取消永不禁用：${row.username}`
        : nextNeverDisable
          ? `Never-disable on: ${row.username}`
          : `Never-disable off: ${row.username}`
    );

    void (async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: row.id,
            never_disable: nextNeverDisable,
          }),
        });
        const data = await res.json();
        if (!data.ok || !data.user) {
          throw new Error(String(data.error || "save failed"));
        }
        setUsers((prev) => {
          const next = prev.map((item) =>
            item.id === row.id ? { ...item, ...data.user } : item
          );
          persistUsers(next);
          return next;
        });
      } catch (err) {
        setUsers((prev) => {
          const next = prev.map((item) => (item.id === row.id ? snapshot : item));
          persistUsers(next);
          return next;
        });
        setStatus(
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "操作失败"
              : "Update failed"
        );
        setStatusErr(true);
      }
    })();
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setAddUserSubmitAttempted(true);
    setAddUserModalError("");

    if (hasAdminUserFieldErrors(addUserSubmitErrors)) {
      return;
    }

    setCreating(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          teacher_modules: newTeacherModules,
          jp_lesson_teacher_id: newTeacherId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAddUserModalError(String(data.error || "create failed"));
        return;
      }
      setUsers((prev) => {
        const next = [...prev, data.user as UserRow];
        persistUsers(next);
        return next;
      });
      rememberAdminUserPassword(data.user.id, newPassword);
      setNewUsername("");
      setNewPassword("");
      setNewTeacherModules(emptyTeacherModules());
      setNewTeacherId(null);
      closeAddUserModal();
      void loadTeachers();
      setStatus(
        locale === "zh"
          ? `已创建用户：${data.user.username}`
          : `Created user: ${data.user.username}`
      );
    } catch {
      setAddUserModalError(locale === "zh" ? "创建失败" : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const showCopySuccess = () => {
    setCopyToast(locale === "zh" ? "复制成功" : "Copied");
  };

  const showCopyFailure = () => {
    setCopyToast(locale === "zh" ? "复制失败" : "Copy failed");
  };

  /** 调用 reset-password API，写入本机缓存；系统保留账号直接拒绝。 */
  const requestPasswordReset = async (
    row: UserRow,
    setBusyId: Dispatch<SetStateAction<number | null>>
  ): Promise<string | null> => {
    const username = row.username;
    const isBootstrapAccount = isReservedUsername(
      username,
      ETR_DEFAULT_ADMIN_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USER1_USERNAME
    );

    if (isBootstrapAccount) {
      setStatus(
        locale === "zh"
          ? `「${username}」是系统保留账号，禁止一键随机重置密码。请点「编辑」填写已知密码。`
          : `"${username}" is a system account and cannot be random-reset. Use Edit to set the password.`
      );
      setStatusErr(true);
      return null;
    }

    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        password?: string;
        user?: UserRow;
        error?: string;
      };
      if (!data.ok || !data.password) {
        throw new Error(String(data.error || "reset failed"));
      }
      const password = data.password;
      rememberAdminUserPassword(row.id, password);
      if (data.user) {
        setUsers((prev) => {
          const next = prev.map((item) =>
            item.id === row.id ? { ...item, ...data.user! } : item
          );
          persistUsers(next);
          return next;
        });
      }
      return password;
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : locale === "zh"
            ? "重置密码失败"
            : "Failed to reset password"
      );
      setStatusErr(true);
      return null;
    } finally {
      setBusyId(null);
    }
  };

  /** 解析可复制的密码：每次都重置为新密码再复制，保证复制结果与数据库一致。系统保留账号除外。 */
  const resolvePasswordForCopy = async (row: UserRow): Promise<string | null> =>
    requestPasswordReset(row, setCopyingId);

  const generateLoginLink = async (row: UserRow) => {
    setLinkGeneratingId(row.id);
    setLinkGeneratingWithTemplate(false);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/users/login-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "failed"));
        setStatusErr(true);
        return;
      }
      const url = String(data.url || "");
      const copied = url ? await copyTextToClipboard(url) : false;
      if (copied) showCopySuccess();
      else if (url) showCopyFailure();
      setStatus(
        locale === "zh"
          ? `已为 ${row.username} 生成新登录链接（旧链接与已登录状态已失效；登录后 ${data.session_days ?? 30} 天免登录）${copied ? "，已复制到剪贴板" : ""}：${url}`
          : `New login link for ${row.username} (previous links and sessions invalidated; ${data.session_days ?? 30}-day session after sign-in)${copied ? ", copied" : ""}: ${url}`
      );
    } catch {
      setStatus(locale === "zh" ? "生成链接失败" : "Failed to generate link");
      setStatusErr(true);
    } finally {
      setLinkGeneratingId(null);
      setLinkGeneratingWithTemplate(false);
    }
  };

  const copyWithTemplate = async (row: UserRow, template: LoginLinkTemplate) => {
    setStatus("");
    setStatusErr(false);
    setSelectedTemplateId(template.id);

    const password = await resolvePasswordForCopy(row);
    if (!password) return false;

    const text = renderAdminTemplateCredentialsCopy({
      body: template.body,
      username: row.username,
      password,
      locale,
      role: row.role,
      teacherModules: row.teacher_modules,
    });

    setLinkGeneratingId(row.id);
    setLinkGeneratingWithTemplate(true);
    try {
      const copied = await copyTextToClipboard(text);
      if (copied) {
        showCopySuccess();
        setStatus(
          locale === "zh"
            ? `已用模板「${template.name}」复制 ${row.username} 的用户名、密码与抽查链接`
            : `Copied ${row.username} credentials with template "${template.name}"`
        );
        setStatusErr(false);
        return true;
      }
      showCopyFailure();
      setStatus(
        locale === "zh"
          ? `复制失败，请手动复制：\n${text}`
          : `Copy failed. Manual copy:\n${text}`
      );
      setStatusErr(true);
      return false;
    } finally {
      setLinkGeneratingId(null);
      setLinkGeneratingWithTemplate(false);
    }
  };

  const copyUserCredentials = async (row: UserRow) => {
    setStatus("");
    setStatusErr(false);

    const password = await resolvePasswordForCopy(row);
    if (!password) return;

    const text = formatAdminUserCredentials(
      row.username,
      password,
      locale,
      row.role,
      row.teacher_modules
    );
    const copied = await copyTextToClipboard(text);
    if (copied) {
      showCopySuccess();
      setStatus(
        locale === "zh"
          ? `已复制 ${row.username} 的用户名与密码`
          : `Copied username and password for ${row.username}`
      );
      setStatusErr(false);
      return;
    }
    showCopyFailure();
    setStatus(
      locale === "zh"
        ? `复制失败，请手动复制：\n${text}`
        : `Copy failed. Manual copy:\n${text}`
    );
    setStatusErr(true);
  };

  /** 一键更换密码：旧密码与会话立即失效；新密码写入本机缓存并复制。系统保留账号禁止。 */
  const resetUserPassword = async (row: UserRow) => {
    setStatus("");
    setStatusErr(false);

    const username = row.username;
    const isBootstrapAccount = isReservedUsername(
      username,
      ETR_DEFAULT_ADMIN_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USER1_USERNAME
    );
    if (isBootstrapAccount) {
      setStatus(
        locale === "zh"
          ? `「${username}」是系统保留账号，禁止一键随机更换密码。请点「编辑」填写已知密码。`
          : `"${username}" is a system account and cannot be random-reset. Use Edit to set the password.`
      );
      setStatusErr(true);
      return;
    }

    const confirmed = window.confirm(
      locale === "zh"
        ? `确定更换「${username}」的密码吗？\n旧密码将立即失效，已登录会话会被踢下线。\n新密码会复制到剪贴板。`
        : `Reset password for "${username}"?\nThe old password will stop working and active sessions will be signed out.\nThe new password will be copied to the clipboard.`
    );
    if (!confirmed) return;

    const password = await requestPasswordReset(row, setResettingId);
    if (!password) return;

    const text = formatAdminUserCredentials(
      username,
      password,
      locale,
      row.role,
      row.teacher_modules
    );
    const copied = await copyTextToClipboard(text);
    if (copied) {
      showCopySuccess();
      setStatus(
        locale === "zh"
          ? `已更换 ${username} 的密码（旧密码与会话已失效），新密码已复制：${password}`
          : `Password for ${username} reset (old password and sessions invalidated). New password copied: ${password}`
      );
      setStatusErr(false);
      return;
    }
    showCopyFailure();
    setStatus(
      locale === "zh"
        ? `已更换 ${username} 的密码，但复制失败，请手动记下：\n${text}`
        : `Password for ${username} was reset, but copy failed. Save manually:\n${text}`
    );
    setStatusErr(true);
  };

  const deleteUser = async (row: UserRow) => {
    const ok = window.confirm(
      locale === "zh"
        ? `确定删除用户「${row.username}」？将同时清除其登录会话与登录链接，此操作不可恢复。`
        : `Delete user "${row.username}"? This removes their sessions and login links and cannot be undone.`
    );
    if (!ok) return;

    const snapshot = users;
    const savedPassword = readAdminUserPassword(row.id);
    setStatus("");
    setStatusErr(false);
    setUsers((prev) => {
      const next = prev.filter((item) => item.id !== row.id);
      persistUsers(next);
      return next;
    });
    forgetAdminUserPassword(row.id);
    setStatus(
      locale === "zh"
        ? `已删除用户：${row.username}`
        : `Deleted user: ${row.username}`
    );

    setDeletingId(row.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(String(data.error || "delete failed"));
      }
    } catch (err) {
      setUsers(snapshot);
      persistUsers(snapshot);
      if (savedPassword) rememberAdminUserPassword(row.id, savedPassword);
      setStatus(
        err instanceof Error
          ? err.message
          : locale === "zh"
            ? "删除失败"
            : "Delete failed"
      );
      setStatusErr(true);
    } finally {
      setDeletingId(null);
    }
  };

  const applyUserUpdate = useCallback(
    (updated: AdminUserEditRow) => {
      setUsers((prev) => {
        const next = prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
        persistUsers(next);
        return next;
      });
      setStatus(
        locale === "zh"
          ? `已更新用户：${updated.username}`
          : `Updated user: ${updated.username}`
      );
      setStatusErr(false);
    },
    [locale, persistUsers]
  );

  const handleUserSaveFailed = useCallback(
    (userId: number, snapshot: AdminUserEditRow, message: string) => {
      setUsers((prev) => {
        const next = prev.map((item) => {
          if (item.id !== userId) return item;
          return {
            ...item,
            ...snapshot,
            disabled: snapshot.disabled ?? item.disabled,
            created_at: snapshot.created_at ?? item.created_at,
            last_login_at: snapshot.last_login_at ?? item.last_login_at,
            last_login_ip: snapshot.last_login_ip ?? item.last_login_ip,
            jp_lesson_teacher_id:
              snapshot.jp_lesson_teacher_id !== undefined
                ? snapshot.jp_lesson_teacher_id
                : item.jp_lesson_teacher_id,
            jp_lesson_teacher_name:
              snapshot.jp_lesson_teacher_name !== undefined
                ? snapshot.jp_lesson_teacher_name
                : item.jp_lesson_teacher_name,
          };
        });
        persistUsers(next);
        return next;
      });
      setStatus(message);
      setStatusErr(true);
    },
    [persistUsers]
  );


  return {
    openAddUserModal,
    closeAddUserModal,
    openEditUser,
    openBindTeacher,
    createTemplate,
    startEditTemplate,
    cancelEditTemplate,
    saveEditTemplate,
    deleteTemplate,
    toggleDisabled,
    toggleNeverDisable,
    createUser,
    generateLoginLink,
    copyWithTemplate,
    copyUserCredentials,
    resetUserPassword,
    deleteUser,
    applyUserUpdate,
    handleUserSaveFailed,
  };
}
