"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
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
import { AdminUserBindTeacherModal } from "@/components/AdminUserBindTeacherModal";
import {
  emptyTeacherModules,
  type RbacTeacherModules,
} from "@/lib/rbac";
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
import { ETR_DEFAULT_JP_VOCAB_USERNAME, ETR_DEFAULT_JP_VOCAB_USER1_USERNAME, ETR_DEFAULT_ADMIN_USERNAME, isReservedUsername } from "@/lib/etr-auth";
import { renderLoginLinkTemplate } from "@/lib/login-link-template-render";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { LoginLinkTemplate } from "@/lib/types";
import { AdminUsersPageStyles } from "@/components/admin-users-page/AdminUsersPageStyles";
import { AdminUsersToolbar } from "@/components/admin-users-page/AdminUsersToolbar";
import { AdminUsersPageModals } from "@/components/admin-users-page/AdminUsersPageModals";
import { AdminUsersList } from "@/components/admin-users-page/AdminUsersList";
import { AdminUsersTemplatesModal } from "@/components/admin-users-page/AdminUsersTemplatesModal";
import { AdminUsersAddUserModal } from "@/components/admin-users-page/AdminUsersAddUserModal";

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

      <AdminUsersToolbar
        locale={locale}
        selectedTemplate={selectedTemplate}
        onOpenAddUser={openAddUserModal}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />



            <AdminUsersList
        locale={locale}
        loading={loading}
        refreshing={refreshing}
        users={users}
        filteredUsers={filteredUsers}
        searchQuery={searchQuery}
        searchActive={searchActive}
        onSearchQueryChange={setSearchQuery}
        sortField={sortField}
        sortLabel={sortLabel}
        onToggleSort={toggleSort}
        highlightUserId={highlightUserId}
        currentUserId={currentUser?.id}
        selectedTemplate={selectedTemplate}
        deletingId={deletingId}
        linkGeneratingId={linkGeneratingId}
        linkGeneratingWithTemplate={linkGeneratingWithTemplate}
        copyingId={copyingId}
        onBindTeacher={openBindTeacher}
        onEdit={openEditUser}
        onCopyCredentials={copyUserCredentials}
        onGenerateLoginLink={generateLoginLink}
        onToggleNeverDisable={toggleNeverDisable}
        onToggleDisabled={toggleDisabled}
        onDelete={deleteUser}
      />

      <AdminUsersPageModals
        locale={locale}
        editingUser={editingUser}
        bindingUser={bindingUser}
        teachers={teachers}
        teachersLoading={teachersLoading}
        addUserOpen={addUserOpen}
        mounted={mounted}
        creating={creating}
        newUsername={newUsername}
        newPassword={newPassword}
        newTeacherModules={newTeacherModules}
        newTeacherId={newTeacherId}
        addUserModalError={addUserModalError}
        addUserDisplayedErrors={addUserDisplayedErrors}
        templatesOpen={templatesOpen}
        templates={templates}
        templatesLoading={templatesLoading}
        templateSaving={templateSaving}
        selectedTemplateId={selectedTemplateId}
        newTemplateName={newTemplateName}
        newTemplateBody={newTemplateBody}
        editingTemplateId={editingTemplateId}
        editTemplateName={editTemplateName}
        editTemplateBody={editTemplateBody}
        setEditingUser={setEditingUser}
        applyUserUpdate={applyUserUpdate}
        loadTeachers={loadTeachers}
        handleUserSaveFailed={handleUserSaveFailed}
        setBindingUser={setBindingUser}
        persistUsers={persistUsers}
        setUsers={setUsers}
        setStatus={setStatus}
        setStatusErr={setStatusErr}
        closeAddUserModal={closeAddUserModal}
        setNewUsername={setNewUsername}
        setNewPassword={setNewPassword}
        setNewTeacherModules={setNewTeacherModules}
        setNewTeacherId={setNewTeacherId}
        setAddUserModalError={setAddUserModalError}
        createUser={createUser}
        setTemplatesOpen={setTemplatesOpen}
        setSelectedTemplateId={setSelectedTemplateId}
        setNewTemplateName={setNewTemplateName}
        setNewTemplateBody={setNewTemplateBody}
        setEditTemplateName={setEditTemplateName}
        setEditTemplateBody={setEditTemplateBody}
        createTemplate={createTemplate}
        startEditTemplate={startEditTemplate}
        saveEditTemplate={saveEditTemplate}
        cancelEditTemplate={cancelEditTemplate}
        deleteTemplate={deleteTemplate}
      />


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
