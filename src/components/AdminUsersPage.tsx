"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { CopyToast } from "@/components/CopyToast";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
} from "@/lib/locale-path";
import {
  AdminUserEditModal,
  type AdminJpLessonTeacherOption,
  type AdminUserEditRow,
} from "@/components/AdminUserEditModal";
import { AdminUserTeacherModulesField } from "@/components/AdminUserTeacherModulesField";
import { AdminUserBindTeacherModal } from "@/components/AdminUserBindTeacherModal";
import {
  emptyTeacherModules,
  type RbacTeacherModules,
} from "@/lib/rbac";
import { formatTeacherLessonDisplayLabel } from "@/lib/jp-lesson-teacher-rate";
import {
  formatAdminUserCredentials,
  readAdminUserPassword,
  rememberAdminUserPassword,
  forgetAdminUserPassword,
} from "@/lib/admin-user-credentials";
import {
  parseAdminUsersApi,
  readAdminUsersCache,
  writeAdminUsersCache,
} from "@/lib/admin-users-cache";
import {
  adminUserFieldErrors,
  hasAdminUserFieldErrors,
} from "@/lib/admin-user-validation";
import { ETR_PASSWORD_MIN_LENGTH, ETR_USERNAME_MAX_LENGTH, ETR_USERNAME_MIN_LENGTH, ETR_DEFAULT_JP_VOCAB_USERNAME, ETR_DEFAULT_JP_VOCAB_USER1_USERNAME, ETR_DEFAULT_ADMIN_USERNAME, isReservedUsername } from "@/lib/etr-auth";
import { formatBeijingDateTime, parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import { renderLoginLinkTemplate } from "@/lib/login-link-template-render";
import { formatIpForDisplay } from "@/lib/client-ip";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { LoginLinkTemplate } from "@/lib/types";
import { AdminUsersPageStyles } from "@/components/admin-users-page/AdminUsersPageStyles";

import {
  readSelectedTemplateId,
  rememberSelectedTemplateId,
  type UserRow,
  type UserSortField,
  type UserSortDirection,
  sortUsers,
  matchesAdminUserSearch,
  formatAdminDateTime,
  AdminUserCardField,
  AdminUserIpDisplay,
  AdminUserActions,
} from "@/components/admin-users-page/admin-users-page-helpers";

function AdminUsersPageContent() {
  const { locale } = useI18n();
  const { isAdmin, user: currentUser, checking } = useEtrAuth();
  const searchParams = useSearchParams();
  const focusUserId = useMemo(() => {
    const raw = searchParams.get("user");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [linkGeneratingId, setLinkGeneratingId] = useState<number | null>(null);
  const [linkGeneratingWithTemplate, setLinkGeneratingWithTemplate] = useState(false);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<LoginLinkTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateBody, setEditTemplateBody] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newTeacherModules, setNewTeacherModules] =
    useState<RbacTeacherModules>(emptyTeacherModules());
  const [newTeacherId, setNewTeacherId] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<AdminJpLessonTeacherOption[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [bindingUser, setBindingUser] = useState<UserRow | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserModalError, setAddUserModalError] = useState("");
  const [addUserSubmitAttempted, setAddUserSubmitAttempted] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [sortField, setSortField] = useState<UserSortField>("last_login_at");
  const [sortDirection, setSortDirection] = useState<UserSortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const persistUsers = useCallback((next: UserRow[]) => {
    writeAdminUsersCache(next);
  }, []);

  const load = useCallback(async () => {
    const cached = readAdminUsersCache();
    const hasCache = cached != null;
    if (hasCache) {
      setUsers(cached);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setStatus("");
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      const next = parseAdminUsersApi(data);
      setUsers(next);
      persistUsers(next);
    } catch {
      if (!hasCache) {
        setStatus(locale === "zh" ? "加载失败" : "Load failed");
        setStatusErr(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale, persistUsers]);

  useEffect(() => {
    if (checking || !isAdmin || editingUser != null || bindingUser != null) return;
    void load();
  }, [checking, isAdmin, load, editingUser, bindingUser]);

  useEffect(() => {
    if (focusUserId == null || loading || users.length === 0) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const selector = isDesktop
      ? `.admin-table-wrap [data-admin-user-id="${focusUserId}"]`
      : `.admin-cards [data-admin-user-id="${focusUserId}"]`;
    const row = document.querySelector(selector);
    if (!row) return;
    setHighlightUserId(focusUserId);
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightUserId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusUserId, loading, users]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/admin/login-link-templates", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        templates?: LoginLinkTemplate[];
        error?: string;
      };
      if (!data.ok) return;
      const next = data.templates ?? [];
      setTemplates(next);
      setSelectedTemplateId((prev) => {
        const stored = prev ?? readSelectedTemplateId();
        if (stored != null && next.some((item) => item.id === stored)) {
          return stored;
        }
        return next[0]?.id ?? null;
      });
    } catch {
      /* ignore */
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !isAdmin) return;
    void loadTemplates();
  }, [checking, isAdmin, loadTemplates]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    rememberSelectedTemplateId(selectedTemplateId);
  }, [selectedTemplateId]);

  const selectedTemplate =
    selectedTemplateId != null
      ? templates.find((item) => item.id === selectedTemplateId) ?? null
      : null;

  const sortedUsers = useMemo(
    () => sortUsers(users, sortField, sortDirection),
    [users, sortDirection, sortField]
  );

  const filteredUsers = useMemo(
    () => sortedUsers.filter((row) => matchesAdminUserSearch(row, searchQuery, locale)),
    [locale, searchQuery, sortedUsers]
  );

  const searchActive = searchQuery.trim().length > 0;

  const addUserLiveErrors = useMemo(
    () => adminUserFieldErrors(newUsername, newPassword, locale),
    [locale, newPassword, newUsername]
  );

  const addUserSubmitErrors = useMemo(
    () =>
      adminUserFieldErrors(newUsername, newPassword, locale, { requireFilled: true }),
    [locale, newPassword, newUsername]
  );

  const loadTeachers = useCallback(async () => {
    setTeachersLoading(true);
    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teachers?: Array<{
          id: number;
          name?: string;
          hourly_rate?: number | null;
          lesson_minutes?: number | null;
          linked_user?: { id: number; username: string } | null;
        }>;
        error?: string;
      };
      if (!data.ok || !Array.isArray(data.teachers)) {
        throw new Error(data.error || "load teachers failed");
      }
      setTeachers(
        data.teachers.map((t) => {
          const hourlyRaw = t.hourly_rate;
          const minutesRaw = t.lesson_minutes;
          const hourly_rate =
            hourlyRaw == null || !Number.isFinite(Number(hourlyRaw))
              ? null
              : Number(hourlyRaw);
          const lesson_minutes =
            minutesRaw == null || !Number.isFinite(Number(minutesRaw))
              ? null
              : Number(minutesRaw);
          return {
            id: Number(t.id),
            name: String(t.name ?? "").trim(),
            hourly_rate,
            lesson_minutes,
            linked_user: t.linked_user
              ? {
                  id: Number(t.linked_user.id),
                  username: String(t.linked_user.username ?? "").trim(),
                }
              : null,
          };
        })
      );
    } catch {
      setTeachers([]);
    } finally {
      setTeachersLoading(false);
    }
  }, []);

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

  const renderTeacherCell = (row: UserRow) => {
    const teacherName = row.jp_lesson_teacher_name?.trim() || "";
    if (!teacherName) {
      return (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary admin-user-bind-teacher-btn"
          onClick={() => openBindTeacher(row)}
        >
          {locale === "zh" ? "绑定老师" : "Bind teacher"}
        </button>
      );
    }
    return (
      <span className="admin-user-teacher-bound">
        <span className="admin-user-teacher-name">{teacherName}</span>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact admin-user-bind-teacher-btn admin-user-rebind-teacher-btn"
          onClick={() => openBindTeacher(row)}
        >
          {locale === "zh" ? "更改" : "Change"}
        </button>
      </span>
    );
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

  const generateLoginLink = async (row: UserRow, withTemplate: boolean) => {
    if (withTemplate && !selectedTemplate) {
      setStatus(
        locale === "zh"
          ? "请先添加并选择文字模板，再使用「带模板复制」"
          : "Add and select a template before copying with template"
      );
      setStatusErr(true);
      return;
    }

    setLinkGeneratingId(row.id);
    setLinkGeneratingWithTemplate(withTemplate);
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
      const copyText =
        withTemplate && selectedTemplate
          ? renderLoginLinkTemplate(selectedTemplate.body, url)
          : url;
      let copied = false;
      if (copyText && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        copied = true;
        showCopySuccess();
      }
      setStatus(
        locale === "zh"
          ? withTemplate
            ? `已为 ${row.username} 生成新登录链接并带模板复制${copied ? "到剪贴板" : ""}（旧链接与已登录状态已失效；登录后 ${data.session_days ?? 30} 天免登录）`
            : `已为 ${row.username} 生成新登录链接（旧链接与已登录状态已失效；登录后 ${data.session_days ?? 30} 天免登录）${copied ? "，已复制到剪贴板" : ""}：${url}`
          : withTemplate
            ? `New login link for ${row.username} copied with template${copied ? "" : " (copy failed)"} (previous links and sessions invalidated; ${data.session_days ?? 30}-day session after sign-in)`
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

  const copyUserCredentials = async (row: UserRow) => {
    setStatus("");
    setStatusErr(false);

    let password = readAdminUserPassword(row.id);
    const username = row.username;
    const isBootstrapAccount = isReservedUsername(
      username,
      ETR_DEFAULT_ADMIN_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USERNAME,
      ETR_DEFAULT_JP_VOCAB_USER1_USERNAME
    );

    if (!password) {
      if (isBootstrapAccount) {
        setStatus(
          locale === "zh"
            ? `「${username}」是系统保留账号，禁止一键随机重置密码。请点「编辑」填写已知密码（填完会缓存在本机，之后才能复制）。`
            : `"${username}" is a system account and cannot be random-reset. Use Edit to enter the known password (then it can be copied from local cache).`
        );
        setStatusErr(true);
        return;
      }

      const ok = window.confirm(
        locale === "zh"
          ? `本地未保存用户「${username}」的密码。\n是否重置为新密码并复制？（旧密码将失效）`
          : `No saved password for "${username}". Reset to a new password and copy? (The old password will stop working.)`
      );
      if (!ok) return;

      setCopyingId(row.id);
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
        password = data.password;
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
      } catch (err) {
        setStatus(
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "重置密码失败"
              : "Failed to reset password"
        );
        setStatusErr(true);
        return;
      } finally {
        setCopyingId(null);
      }
    }

    const text = formatAdminUserCredentials(
      username,
      password!,
      locale,
      row.role
    );
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showCopySuccess();
      }
      setStatus(
        locale === "zh"
          ? `已复制 ${username} 的用户名与密码`
          : `Copied username and password for ${username}`
      );
      setStatusErr(false);
    } catch {
      setStatus(
        locale === "zh"
          ? `复制失败，请手动复制：\n${text}`
          : `Copy failed. Manual copy:\n${text}`
      );
      setStatusErr(true);
    }
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

  const anyModalOpen =
    addUserOpen || templatesOpen || editingUser != null || bindingUser != null;
  const addUserDisplayedErrors = addUserSubmitAttempted ? addUserSubmitErrors : addUserLiveErrors;

  // Hooks must stay above the auth early-return: logout / stale cache flip
  // checking→admin can change whether we hit that return, and React #310/#300
  // if these effects only run on the admin path.
  useEffect(() => {
    if (!anyModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (bindingUser != null) {
        setBindingUser(null);
        return;
      }
      if (editingUser != null) {
        setEditingUser(null);
        return;
      }
      if (templatesOpen) {
        setTemplatesOpen(false);
        cancelEditTemplate();
        return;
      }
      if (addUserOpen) {
        closeAddUserModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addUserOpen, templatesOpen, editingUser, bindingUser, anyModalOpen]);

  useEffect(() => {
    if (!anyModalOpen) return;
    return lockBodyScroll();
  }, [anyModalOpen]);

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title={locale === "zh" ? "用户管理" : "User management"}
        required={locale === "zh" ? "请使用管理员账号登录。" : "Please log in as admin."}
        login={locale === "zh" ? "去登录" : "Log in"}
        registered={!checking && isAdmin}
      />
    );
  }

  const toggleSort = (field: UserSortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDirection) => (prevDirection === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDirection(field === "last_login_at" ? "desc" : "asc");
      return field;
    });
  };

  const sortLabel = (field: UserSortField): string => {
    if (sortField !== field) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{locale === "zh" ? "用户管理" : "User management"}</h1>
        <p className="sub">
          {locale === "zh"
            ? "打开本页时只会补建缺失的 Admin / 李老师 / user1，不会改已有密码。也可手动添加用户；禁用后用户将看到维护提示。系统保留账号禁止「复制账号密码」一键随机重置。"
            : "Opening this page only creates missing Admin / teacher bootstrap accounts — it never overwrites existing passwords. System accounts cannot be random-reset via Copy credentials."}
        </p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminRbacPath(locale)}>{locale === "zh" ? "角色权限" : "Roles"}</a>
          {" · "}
          <a href={adminToolCodesPath(locale)}>{locale === "zh" ? "工具发码" : "Tool codes"}</a>
        </p>
      </div>

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section admin-users-toolbar-section">
        <div className="admin-users-toolbar">
          <div className="admin-users-toolbar-title">
            <h2 className="admin-user-add-title">{locale === "zh" ? "快捷操作" : "Quick actions"}</h2>
            <p className="hint admin-users-toolbar-sub">
              {selectedTemplate
                ? locale === "zh"
                  ? `当前模板：${selectedTemplate.name}`
                  : `Active template: ${selectedTemplate.name}`
                : locale === "zh"
                  ? "当前模板：未选择（带模板复制将不可用）"
                  : "Active template: none (copy with template disabled)"}
            </p>
          </div>
          <div className="admin-users-toolbar-actions">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={openAddUserModal}
            >
              {locale === "zh" ? "添加用户" : "Add user"}
            </button>
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={() => setTemplatesOpen(true)}
            >
              {locale === "zh" ? "管理登录模板" : "Manage templates"}
            </button>
          </div>
        </div>
      </section>

      <section className="section etr-panel admin-rbac-section">
        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : users.length === 0 ? (
          <p className="hint">
            {locale === "zh"
              ? "暂无其他用户。可使用上方表单添加，或确认 Cloudflare Secret 已配置后刷新本页。"
              : "No users yet. Add one above or refresh after configuring env secrets."}
          </p>
        ) : (
          <>
            {refreshing ? (
              <p className="hint" style={{ marginBottom: "0.65rem" }}>
                {locale === "zh" ? "同步中…" : "Syncing…"}
              </p>
            ) : null}

            <div className="admin-rbac-toolbar admin-rbac-toolbar--inline admin-users-search-bar" role="search">
              <label className="admin-rbac-search-field" htmlFor="admin-users-search">
                <span className="admin-rbac-search-label">
                  {locale === "zh" ? "搜索用户" : "Search users"}
                </span>
                <input
                  id="admin-users-search"
                  type="search"
                  className="admin-rbac-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    locale === "zh"
                      ? "用户名、角色、对应老师、ID、状态、IP…"
                      : "Username, role, teacher, ID, status, IP…"
                  }
                  autoComplete="off"
                />
              </label>
              {searchActive ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact admin-rbac-search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  {locale === "zh" ? "清除" : "Clear"}
                </button>
              ) : null}
            </div>

            {searchActive ? (
              <p className="hint admin-users-search-meta">
                {locale === "zh"
                  ? `匹配 ${filteredUsers.length} / ${users.length} 人`
                  : `Matched ${filteredUsers.length} / ${users.length}`}
              </p>
            ) : null}

            {searchActive && filteredUsers.length === 0 ? (
              <p className="hint admin-users-search-empty">
                {locale === "zh" ? "没有匹配的用户。" : "No users match your search."}
              </p>
            ) : (
              <>
            <div className="admin-users-mobile-sort">
              <span className="admin-users-mobile-sort-label">
                {locale === "zh" ? "排序" : "Sort"}
              </span>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact admin-users-mobile-sort-btn${
                  sortField === "id" ? " btn-rsi-filter--primary" : ""
                }`}
                onClick={() => toggleSort("id")}
              >
                {locale === "zh" ? "ID" : "ID"}
                {sortLabel("id")}
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact admin-users-mobile-sort-btn${
                  sortField === "last_login_at" ? " btn-rsi-filter--primary" : ""
                }`}
                onClick={() => toggleSort("last_login_at")}
              >
                {locale === "zh" ? "最近登录" : "Last login"}
                {sortLabel("last_login_at")}
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact admin-users-mobile-sort-btn${
                  sortField === "disabled" ? " btn-rsi-filter--primary" : ""
                }`}
                onClick={() => toggleSort("disabled")}
              >
                {locale === "zh" ? "状态" : "Status"}
                {sortLabel("disabled")}
              </button>
            </div>

            <div className="admin-cards">
              {filteredUsers.map((row) => (
                <article
                  key={row.id}
                  data-admin-user-id={row.id}
                  className={`strategy-card admin-card admin-user-card${
                    highlightUserId === row.id ? " admin-user-row--highlight" : ""
                  }`}
                >
                  <h3 className="strategy-card-title">
                    {row.username}
                    <span className="admin-card-meta">#{row.id}</span>
                  </h3>
                  <dl className="strategy-card-grid">
                    <AdminUserCardField
                      label={locale === "zh" ? "角色" : "Role"}
                      value={row.role_label}
                    />
                    <AdminUserCardField
                      label={locale === "zh" ? "状态" : "Status"}
                      value={
                        <>
                          {row.disabled
                            ? locale === "zh"
                              ? "已禁用"
                              : "Disabled"
                            : locale === "zh"
                              ? "正常"
                              : "Active"}
                          {row.never_disable ? (
                            <span className="admin-user-never-disable-badge">
                              {locale === "zh" ? " · 永不禁用" : " · Never disable"}
                            </span>
                          ) : null}
                        </>
                      }
                    />
                    <AdminUserCardField
                      label={locale === "zh" ? "对应老师" : "Teacher"}
                      value={renderTeacherCell(row)}
                      wide
                    />
                    <AdminUserCardField
                      label={locale === "zh" ? "创建时间（北京时间）" : "Created (Beijing)"}
                      value={formatAdminDateTime(row.created_at)}
                      wide
                    />
                    <AdminUserCardField
                      label={locale === "zh" ? "最后一次登录（北京时间）" : "Last login (Beijing)"}
                      value={formatAdminDateTime(row.last_login_at)}
                      wide
                    />
                    <AdminUserCardField
                      label={locale === "zh" ? "最后一次登录 IP" : "Last login IP"}
                      value={<AdminUserIpDisplay ip={row.last_login_ip} locale={locale} />}
                      wide
                    />
                  </dl>
                  <AdminUserActions
                    row={row}
                    locale={locale}
                    currentUserId={currentUser?.id}
                    selectedTemplate={selectedTemplate}
                    deletingId={deletingId}
                    linkGeneratingId={linkGeneratingId}
                    linkGeneratingWithTemplate={linkGeneratingWithTemplate}
                    copyingId={copyingId}
                    onEdit={openEditUser}
                    onCopyCredentials={copyUserCredentials}
                    onGenerateLoginLink={generateLoginLink}
                    onToggleNeverDisable={toggleNeverDisable}
                    onToggleDisabled={toggleDisabled}
                    onDelete={deleteUser}
                  />
                </article>
              ))}
            </div>

            <div className="admin-table-wrap">
              <table className="admin-rbac-table admin-users-table">
                <thead>
                  <tr>
                    <th className="admin-user-col-id">
                      <button
                        type="button"
                        className="admin-user-sort-btn"
                        onClick={() => toggleSort("id")}
                      >
                        {locale === "zh" ? "ID" : "ID"}
                        {sortLabel("id")}
                      </button>
                    </th>
                    <th className="admin-user-col-username">
                      {locale === "zh" ? "用户名" : "Username"}
                    </th>
                    <th className="admin-user-col-role">{locale === "zh" ? "角色" : "Role"}</th>
                    <th className="admin-user-col-teacher">
                      {locale === "zh" ? "对应老师" : "Teacher"}
                    </th>
                    <th
                      className="admin-user-col-created"
                      title={locale === "zh" ? "创建时间（北京时间）" : "Created (Beijing)"}
                    >
                      {locale === "zh" ? "创建时间" : "Created"}
                    </th>
                    <th
                      className="admin-user-col-login"
                      title={locale === "zh" ? "最后一次登录（北京时间）" : "Last login (Beijing)"}
                    >
                      <button
                        type="button"
                        className="admin-user-sort-btn"
                        onClick={() => toggleSort("last_login_at")}
                      >
                        {locale === "zh" ? "最后登录" : "Last login"}
                        {sortLabel("last_login_at")}
                      </button>
                    </th>
                    <th className="admin-user-ip-col">
                      {locale === "zh" ? "登录 IP" : "Login IP"}
                    </th>
                    <th className="admin-user-col-status">
                      <button
                        type="button"
                        className="admin-user-sort-btn"
                        onClick={() => toggleSort("disabled")}
                      >
                        {locale === "zh" ? "状态" : "Status"}
                        {sortLabel("disabled")}
                      </button>
                    </th>
                    <th className="admin-user-actions-col">{locale === "zh" ? "操作" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <tr
                      key={row.id}
                      data-admin-user-id={row.id}
                      className={
                        highlightUserId === row.id ? "admin-user-row--highlight" : undefined
                      }
                    >
                      <td className="admin-user-col-id">{row.id}</td>
                      <td className="admin-user-col-username admin-rbac-username">{row.username}</td>
                      <td className="admin-user-col-role">{row.role_label}</td>
                      <td className="admin-user-col-teacher">
                        {renderTeacherCell(row)}
                      </td>
                      <td className="admin-user-col-created">{formatAdminDateTime(row.created_at)}</td>
                      <td className="admin-user-col-login">{formatAdminDateTime(row.last_login_at)}</td>
                      <td className="admin-user-ip-col">
                        <AdminUserIpDisplay ip={row.last_login_ip} locale={locale} />
                      </td>
                      <td className="admin-user-col-status">
                        {row.disabled
                          ? locale === "zh"
                            ? "已禁用"
                            : "Disabled"
                          : locale === "zh"
                            ? "正常"
                            : "Active"}
                        {row.never_disable ? (
                          <span className="admin-user-never-disable-badge">
                            {locale === "zh" ? " · 永不禁用" : " · Never disable"}
                          </span>
                        ) : null}
                      </td>
                      <td className="admin-user-actions-col">
                        <AdminUserActions
                          row={row}
                          locale={locale}
                          currentUserId={currentUser?.id}
                          selectedTemplate={selectedTemplate}
                          deletingId={deletingId}
                          linkGeneratingId={linkGeneratingId}
                          linkGeneratingWithTemplate={linkGeneratingWithTemplate}
                          copyingId={copyingId}
                          onEdit={openEditUser}
                          onCopyCredentials={copyUserCredentials}
                          onGenerateLoginLink={generateLoginLink}
                          onToggleNeverDisable={toggleNeverDisable}
                          onToggleDisabled={toggleDisabled}
                          onDelete={deleteUser}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}
          </>
        )}
      </section>

      <AdminUserEditModal
        open={editingUser != null}
        user={editingUser}
        locale={locale}
        teachers={teachers}
        teachersLoading={teachersLoading}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) => {
          setEditingUser(null);
          applyUserUpdate(updated);
          void loadTeachers();
        }}
        onSaveFailed={handleUserSaveFailed}
        onCredentialsStored={rememberAdminUserPassword}
      />

      <AdminUserBindTeacherModal
        open={bindingUser != null}
        user={bindingUser}
        locale={locale}
        teachers={teachers}
        teachersLoading={teachersLoading}
        onClose={() => setBindingUser(null)}
        onBound={(bound) => {
          setUsers((prev) => {
            const next = prev.map((item) =>
              item.id === bound.id
                ? {
                    ...item,
                    jp_lesson_teacher_id: bound.jp_lesson_teacher_id,
                    jp_lesson_teacher_name: bound.jp_lesson_teacher_name,
                  }
                : item.jp_lesson_teacher_id != null &&
                    bound.jp_lesson_teacher_id != null &&
                    item.jp_lesson_teacher_id === bound.jp_lesson_teacher_id &&
                    item.id !== bound.id
                  ? {
                      ...item,
                      jp_lesson_teacher_id: null,
                      jp_lesson_teacher_name: null,
                    }
                  : item
            );
            persistUsers(next);
            return next;
          });
          setStatus(
            locale === "zh"
              ? `已更新老师绑定：${bound.jp_lesson_teacher_name || "—"}`
              : `Teacher binding updated: ${bound.jp_lesson_teacher_name || "—"}`
          );
          setStatusErr(false);
          void loadTeachers();
        }}
      />

      {mounted && addUserOpen
        ? createPortal(
            <div
              className="admin-users-modal-overlay"
              onMouseDown={(e) => closeModalOnBackdropMouseDown(e, closeAddUserModal)}
            >
              <div
                className="admin-users-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-users-add-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="admin-users-modal-header">
                  <div>
                    <h2 id="admin-users-add-title" className="admin-users-modal-title">
                      {locale === "zh" ? "添加用户" : "Add user"}
                    </h2>
                    <p className="admin-users-modal-subtitle">
                      {locale === "zh"
                        ? "新增用户名、密码与角色。"
                        : "Create a new account with username, password, and role."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-users-modal-close"
                    aria-label={locale === "zh" ? "关闭" : "Close"}
                    onClick={closeAddUserModal}
                  >
                    ×
                  </button>
                </div>

                <form
                  className="admin-users-modal-body admin-user-add-form"
                  autoComplete="off"
                  onSubmit={(e) => void createUser(e)}
                >
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "用户名" : "Username"}</span>
                    <input
                      type="text"
                      name="admin-user-new-username"
                      value={newUsername}
                      disabled={creating}
                      placeholder={
                        locale === "zh"
                          ? `${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} 个字符`
                          : `${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} characters`
                      }
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className={
                        addUserDisplayedErrors.username ? "admin-user-add-field--invalid" : undefined
                      }
                      onChange={(e) => {
                        setNewUsername(e.target.value);
                        setAddUserModalError("");
                      }}
                    />
                    {addUserDisplayedErrors.username ? (
                      <span className="admin-user-add-field-error">
                        {addUserDisplayedErrors.username}
                      </span>
                    ) : null}
                  </label>
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "密码" : "Password"}</span>
                    <input
                      type="password"
                      name="admin-user-new-password"
                      value={newPassword}
                      disabled={creating}
                      placeholder={
                        locale === "zh"
                          ? `至少 ${ETR_PASSWORD_MIN_LENGTH} 位`
                          : `Min ${ETR_PASSWORD_MIN_LENGTH} chars`
                      }
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      className={
                        addUserDisplayedErrors.password ? "admin-user-add-field--invalid" : undefined
                      }
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setAddUserModalError("");
                      }}
                    />
                    {addUserDisplayedErrors.password ? (
                      <span className="admin-user-add-field-error">
                        {addUserDisplayedErrors.password}
                      </span>
                    ) : null}
                  </label>
                  <AdminUserTeacherModulesField
                    value={newTeacherModules}
                    onChange={setNewTeacherModules}
                    locale={locale}
                    disabled={creating}
                    fieldClassPrefix="admin-user-add"
                  />
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "关联老师" : "Linked teacher"}</span>
                    <select
                      value={newTeacherId ?? ""}
                      disabled={creating || teachersLoading}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setNewTeacherId(raw ? Number(raw) : null);
                      }}
                    >
                      <option value="">
                        {locale === "zh" ? "— 不关联 —" : "— None —"}
                      </option>
                      {teachers.map((teacher) => {
                        const baseLabel = formatTeacherLessonDisplayLabel(
                          teacher,
                          locale
                        );
                        const linked = teacher.linked_user?.username;
                        return (
                          <option key={teacher.id} value={teacher.id}>
                            {linked
                              ? locale === "zh"
                                ? `${baseLabel}（当前关联 ${linked}，保存后改绑）`
                                : `${baseLabel} (now ${linked}; will rebind)`
                              : baseLabel}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {addUserModalError ? (
                    <p className="admin-user-add-modal-error">{addUserModalError}</p>
                  ) : null}
                  <div className="admin-users-modal-footer">
                    <p className="hint admin-user-add-hint" style={{ margin: 0 }}>
                      {locale === "zh"
                        ? "系统保留名 Admin、LiLaoshi、user1 不可重复创建。"
                        : "Reserved: Admin, LiLaoshi, user1."}
                    </p>
                    <button
                      type="submit"
                      className="btn-rsi-filter btn-rsi-filter--primary admin-user-add-submit"
                      disabled={creating}
                    >
                      {creating
                        ? locale === "zh"
                          ? "创建中…"
                          : "Creating…"
                        : locale === "zh"
                          ? "添加用户"
                          : "Add user"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && templatesOpen
        ? createPortal(
            <div
              className="admin-users-modal-overlay"
              onMouseDown={(e) =>
                closeModalOnBackdropMouseDown(e, () => {
                  setTemplatesOpen(false);
                  cancelEditTemplate();
                })
              }
            >
              <div
                className="admin-users-modal admin-users-modal--wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-users-templates-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="admin-users-modal-header">
                  <div>
                    <h2 id="admin-users-templates-title" className="admin-users-modal-title">
                      {locale === "zh" ? "登录链接文字模板" : "Login link templates"}
                    </h2>
                    <p className="admin-users-modal-subtitle">
                      {locale === "zh"
                        ? "这里管理模板；列表操作里「带模板复制」会使用当前选用模板。"
                        : "Manage templates here. 'Copy with template' uses the active template."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-users-modal-close"
                    aria-label={locale === "zh" ? "关闭" : "Close"}
                    onClick={() => {
                      setTemplatesOpen(false);
                      cancelEditTemplate();
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="admin-users-modal-body admin-users-templates-body">
                  <p className="hint admin-login-link-templates-hint" style={{ marginTop: 0 }}>
                    {locale === "zh"
                      ? "复制登录链接时可选择「仅链接」或「带模板复制」。每次生成都会作废该用户此前的登录链接与已登录状态。正文会放在链接前面；也可写 {login_url} 指定链接位置。"
                      : "Copy plain URL or copy with template text. Each new link invalidates previous links/sessions. Use {login_url} to place the link inline."}
                  </p>

                  {templates.length > 0 ? (
                    <label className="admin-login-link-template-select">
                      <span>{locale === "zh" ? "当前选用模板" : "Active template"}</span>
                      <select
                        value={selectedTemplateId ?? ""}
                        disabled={templatesLoading || templateSaving}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setSelectedTemplateId(Number.isInteger(id) && id > 0 ? id : null);
                        }}
                      >
                        {templates.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {templatesLoading ? (
                    <p className="hint">{locale === "zh" ? "加载模板…" : "Loading templates…"}</p>
                  ) : templates.length === 0 ? (
                    <p className="hint">
                      {locale === "zh" ? "暂无模板，可在下方添加。" : "No templates yet. Add one below."}
                    </p>
                  ) : (
                    <div className="admin-login-link-templates-list">
                      {templates.map((template) => (
                        <div key={template.id} className="admin-login-link-template-card">
                          {editingTemplateId === template.id ? (
                            <>
                              <label className="admin-login-link-template-field">
                                <span>{locale === "zh" ? "名称" : "Name"}</span>
                                <input
                                  type="text"
                                  value={editTemplateName}
                                  disabled={templateSaving}
                                  onChange={(e) => setEditTemplateName(e.target.value)}
                                />
                              </label>
                              <label className="admin-login-link-template-field">
                                <span>{locale === "zh" ? "正文" : "Body"}</span>
                                <textarea
                                  rows={4}
                                  value={editTemplateBody}
                                  disabled={templateSaving}
                                  onChange={(e) => setEditTemplateBody(e.target.value)}
                                />
                              </label>
                              <div className="admin-login-link-template-actions">
                                <button
                                  type="button"
                                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                                  disabled={
                                    templateSaving ||
                                    !editTemplateName.trim() ||
                                    !editTemplateBody.trim()
                                  }
                                  onClick={() => void saveEditTemplate()}
                                >
                                  {templateSaving
                                    ? locale === "zh"
                                      ? "保存中…"
                                      : "Saving…"
                                    : locale === "zh"
                                      ? "保存"
                                      : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-rsi-filter btn-rsi-filter--compact"
                                  disabled={templateSaving}
                                  onClick={cancelEditTemplate}
                                >
                                  {locale === "zh" ? "取消" : "Cancel"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="admin-login-link-template-head">
                                <strong>{template.name}</strong>
                                <div className="admin-login-link-template-actions">
                                  <button
                                    type="button"
                                    className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
                                    disabled={templateSaving}
                                    onClick={() => startEditTemplate(template)}
                                  >
                                    {locale === "zh" ? "编辑" : "Edit"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger admin-user-btn"
                                    disabled={templateSaving}
                                    onClick={() => void deleteTemplate(template)}
                                  >
                                    {locale === "zh" ? "删除" : "Delete"}
                                  </button>
                                </div>
                              </div>
                              <pre className="admin-login-link-template-body">{template.body}</pre>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="admin-login-link-template-add">
                    <h3 className="admin-login-link-template-add-title">
                      {locale === "zh" ? "添加模板" : "Add template"}
                    </h3>
                    <label className="admin-login-link-template-field">
                      <span>{locale === "zh" ? "名称" : "Name"}</span>
                      <input
                        type="text"
                        value={newTemplateName}
                        disabled={templateSaving}
                        placeholder={locale === "zh" ? "例如：日语课提醒" : "e.g. Japanese class reminder"}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                      />
                    </label>
                    <label className="admin-login-link-template-field">
                      <span>{locale === "zh" ? "正文" : "Body"}</span>
                      <textarea
                        rows={4}
                        value={newTemplateBody}
                        disabled={templateSaving}
                        placeholder={
                          locale === "zh"
                            ? "例如：老师请在上课前十几二十分钟，抽查前 20 个单词。"
                            : "e.g. Please review the first 20 words 15–20 minutes before class."
                        }
                        onChange={(e) => setNewTemplateBody(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--primary"
                      disabled={templateSaving || !newTemplateName.trim() || !newTemplateBody.trim()}
                      onClick={() => void createTemplate()}
                    >
                      {templateSaving
                        ? locale === "zh"
                          ? "添加中…"
                          : "Adding…"
                        : locale === "zh"
                          ? "添加模板"
                          : "Add template"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />

      <AdminUsersPageStyles />
    </div>
  );
}

export function AdminUsersPage() {
  return (
    <Suspense fallback={<div className="admin-page"><p className="hint">Loading…</p></div>}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
