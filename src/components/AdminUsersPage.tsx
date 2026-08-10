"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import type { AdminJpLessonTeacherOption } from "@/components/AdminUserEditModal";
import { CopyToast } from "@/components/CopyToast";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
} from "@/lib/locale-path";
import {
  emptyTeacherModules,
  type RbacTeacherModules,
} from "@/lib/rbac";
import {
  parseAdminUsersApi,
  readAdminUsersCache,
  writeAdminUsersCache,
} from "@/lib/admin-users-cache";
import { adminUserFieldErrors } from "@/lib/admin-user-validation";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { LoginLinkTemplate } from "@/lib/types";
import { AdminUsersPageStyles } from "@/components/admin-users-page/AdminUsersPageStyles";
import { AdminUsersList } from "@/components/admin-users-page/AdminUsersList";
import { AdminUsersPageModals } from "@/components/admin-users-page/AdminUsersPageModals";
import { AdminUsersToolbar } from "@/components/admin-users-page/AdminUsersToolbar";
import { useAdminUsersPageActions } from "@/components/admin-users-page/useAdminUsersPageActions";
import {
  readSelectedTemplateId,
  rememberSelectedTemplateId,
  type UserRow,
  type UserSortField,
  type UserSortDirection,
  sortUsers,
  matchesAdminUserSearch,
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
  const [resettingId, setResettingId] = useState<number | null>(null);
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
  const [loginHistoryUser, setLoginHistoryUser] = useState<UserRow | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserModalError, setAddUserModalError] = useState("");
  const [addUserSubmitAttempted, setAddUserSubmitAttempted] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatePickUser, setTemplatePickUser] = useState<UserRow | null>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [credentialsConfirm, setCredentialsConfirm] = useState<{
    username: string;
    password: string;
  } | null>(null);
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
    if (checking || !isAdmin || editingUser != null || bindingUser != null || loginHistoryUser != null) return;
    void load();
  }, [checking, isAdmin, load, editingUser, bindingUser, loginHistoryUser]);

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

  const {
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
    toggleAllowMultiDevice,
    createUser,
    generateLoginLink,
    copyWithTemplate,
    copyUserCredentials,
    resetUserPassword,
    deleteUser,
    applyUserUpdate,
    handleUserSaveFailed,
  } = useAdminUsersPageActions({
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
    setCredentialsConfirm,
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
  });

  const anyModalOpen =
    addUserOpen ||
    templatesOpen ||
    templatePickUser != null ||
    editingUser != null ||
    bindingUser != null ||
    loginHistoryUser != null ||
    credentialsConfirm != null;
  const addUserDisplayedErrors = addUserSubmitAttempted ? addUserSubmitErrors : addUserLiveErrors;
  const templateCopyBusy =
    templatePickUser != null &&
    linkGeneratingId === templatePickUser.id &&
    linkGeneratingWithTemplate;

  const openCopyWithTemplatePick = useCallback(
    (row: UserRow) => {
      if (templates.length === 0) {
        setStatus(
          locale === "zh"
            ? "请先在「管理登录模板」中添加至少一个模板"
            : "Add at least one template under Manage templates first"
        );
        setStatusErr(true);
        setTemplatesOpen(true);
        return;
      }
      setStatus("");
      setStatusErr(false);
      setTemplatePickUser(row);
    },
    [locale, templates.length]
  );

  // Hooks must stay above the auth early-return: logout / stale cache flip
  // checking→admin can change whether we hit that return, and React #310/#300
  // if these effects only run on the admin path.
  useEffect(() => {
    if (!anyModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (templateCopyBusy) return;
      if (credentialsConfirm != null) {
        setCredentialsConfirm(null);
        return;
      }
      if (templatePickUser != null) {
        setTemplatePickUser(null);
        return;
      }
      if (loginHistoryUser != null) {
        setLoginHistoryUser(null);
        return;
      }
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
  }, [
    addUserOpen,
    templatesOpen,
    templatePickUser,
    templateCopyBusy,
    editingUser,
    bindingUser,
    loginHistoryUser,
    credentialsConfirm,
    anyModalOpen,
    cancelEditTemplate,
    closeAddUserModal,
  ]);

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
        templateCount={templates.length}
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
        hasTemplates={templates.length > 0}
        deletingId={deletingId}
        linkGeneratingId={linkGeneratingId}
        linkGeneratingWithTemplate={linkGeneratingWithTemplate}
        copyingId={copyingId}
        resettingId={resettingId}
        onBindTeacher={openBindTeacher}
        onEdit={openEditUser}
        onViewLoginHistory={setLoginHistoryUser}
        onResetPassword={resetUserPassword}
        onCopyCredentials={copyUserCredentials}
        onGenerateLoginLink={generateLoginLink}
        onCopyWithTemplate={openCopyWithTemplatePick}
        onToggleNeverDisable={toggleNeverDisable}
        onToggleAllowMultiDevice={toggleAllowMultiDevice}
        onToggleDisabled={toggleDisabled}
        onDelete={deleteUser}
      />

      <AdminUsersPageModals
        locale={locale}
        editingUser={editingUser}
        bindingUser={bindingUser}
        loginHistoryUser={loginHistoryUser}
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
        templatePickUser={templatePickUser}
        templateCopyBusy={templateCopyBusy}
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
        setLoginHistoryUser={setLoginHistoryUser}
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
        setTemplatePickUser={setTemplatePickUser}
        credentialsConfirm={credentialsConfirm}
        setCredentialsConfirm={setCredentialsConfirm}
        onPickTemplateForCopy={async (template) => {
          const row = templatePickUser;
          if (!row) return;
          const ok = await copyWithTemplate(row, template);
          if (ok) setTemplatePickUser(null);
        }}
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

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className={anyModalOpen ? "copy-toast--above-modal" : undefined}
      />

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
