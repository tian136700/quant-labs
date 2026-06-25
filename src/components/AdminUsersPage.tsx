"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";

type UserRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
  disabled: boolean;
  created_at: string;
};

export function AdminUsersPage() {
  const { locale } = useI18n();
  const { isAdmin, user: currentUser, checking } = useEtrAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [linkGeneratingId, setLinkGeneratingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "jp_vocab">("user");
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "load failed"));
        setStatusErr(true);
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      setStatus(locale === "zh" ? "加载失败" : "Load failed");
      setStatusErr(true);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (checking || !isAdmin) return;
    void load();
  }, [checking, isAdmin, load]);

  const toggleDisabled = async (row: UserRow) => {
    setSavingId(row.id);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id, disabled: !row.disabled }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "save failed"));
        setStatusErr(true);
        return;
      }
      setUsers((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, ...data.user } : item))
      );
      setStatus(locale === "zh" ? "已更新" : "Updated");
    } catch {
      setStatus(locale === "zh" ? "操作失败" : "Update failed");
      setStatusErr(true);
    } finally {
      setSavingId(null);
    }
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
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
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "create failed"));
        setStatusErr(true);
        return;
      }
      setUsers((prev) =>
        [...prev, data.user as UserRow].sort((a, b) =>
          a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
        )
      );
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setStatus(
        locale === "zh"
          ? `已创建用户：${data.user.username}`
          : `Created user: ${data.user.username}`
      );
    } catch {
      setStatus(locale === "zh" ? "创建失败" : "Create failed");
      setStatusErr(true);
    } finally {
      setCreating(false);
    }
  };

  const generateLoginLink = async (row: UserRow) => {
    setLinkGeneratingId(row.id);
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
      let copied = false;
      if (url && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
      setStatus(
        locale === "zh"
          ? `已为 ${row.username} 生成永久登录链接（每次登录后 30 天免登录）${copied ? "，已复制到剪贴板" : ""}：${url}`
          : `Permanent login link for ${row.username} (${data.session_days ?? 30}-day session after each sign-in)${copied ? ", copied" : ""}: ${url}`
      );
    } catch {
      setStatus(locale === "zh" ? "生成链接失败" : "Failed to generate link");
      setStatusErr(true);
    } finally {
      setLinkGeneratingId(null);
    }
  };

  const deleteUser = async (row: UserRow) => {
    const ok = window.confirm(
      locale === "zh"
        ? `确定删除用户「${row.username}」？将同时清除其登录会话与登录链接，此操作不可恢复。`
        : `Delete user "${row.username}"? This removes their sessions and login links and cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(row.id);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "delete failed"));
        setStatusErr(true);
        return;
      }
      setUsers((prev) => prev.filter((item) => item.id !== row.id));
      setStatus(
        locale === "zh"
          ? `已删除用户：${data.username ?? row.username}`
          : `Deleted user: ${data.username ?? row.username}`
      );
    } catch {
      setStatus(locale === "zh" ? "删除失败" : "Delete failed");
      setStatusErr(true);
    } finally {
      setDeletingId(null);
    }
  };

  if (checking) return null;

  if (!isAdmin) {
    return (
      <div className="admin-page admin-page--auth">
        <div className="page-hero etr-hero-center">
          <h1>{locale === "zh" ? "用户管理" : "User management"}</h1>
          <p className="sub">
            {locale === "zh" ? "请使用管理员账号登录。" : "Please log in as admin."}
          </p>
          <div className="etr-form-actions etr-form-actions--center">
            <a
              className="btn-rsi-filter btn-rsi-filter--primary"
              href={teacherReviewNavPath(locale)}
            >
              {locale === "zh" ? "去登录" : "Log in"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{locale === "zh" ? "用户管理" : "User management"}</h1>
        <p className="sub">
          {locale === "zh"
            ? "打开本页时会自动把 Cloudflare Secret / 环境变量里的 Admin、李老师、user1 同步到数据库。也可手动添加用户名与密码；禁用账号后用户将看到维护提示。"
            : "Opening this page syncs Admin / teacher bootstrap accounts from env secrets into D1. You can also add users manually."}
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

      <section className="section etr-panel admin-rbac-section admin-user-add-section">
        <h2 className="admin-user-add-title">
          {locale === "zh" ? "添加用户" : "Add user"}
        </h2>
        <form className="admin-user-add-form" onSubmit={(e) => void createUser(e)}>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "用户名" : "Username"}</span>
            <input
              type="text"
              value={newUsername}
              disabled={creating}
              placeholder={locale === "zh" ? "6–32 个字符" : "6–32 characters"}
              autoComplete="off"
              onChange={(e) => setNewUsername(e.target.value)}
            />
          </label>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "密码" : "Password"}</span>
            <input
              type="password"
              value={newPassword}
              disabled={creating}
              placeholder={locale === "zh" ? "至少 6 位" : "Min 6 chars"}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "角色" : "Role"}</span>
            <select
              value={newRole}
              disabled={creating}
              onChange={(e) => setNewRole(e.target.value as "user" | "jp_vocab")}
            >
              <option value="user">{locale === "zh" ? "普通用户" : "Regular user"}</option>
              <option value="jp_vocab">
                {locale === "zh" ? "日语教师（可编辑单词等）" : "Japanese teacher"}
              </option>
            </select>
          </label>
          <button
            type="submit"
            className="btn-rsi-filter btn-rsi-filter--primary admin-user-add-submit"
            disabled={creating || !newUsername.trim() || !newPassword}
          >
            {creating
              ? locale === "zh"
                ? "创建中…"
                : "Creating…"
              : locale === "zh"
                ? "添加用户"
                : "Add user"}
          </button>
        </form>
        <p className="hint admin-user-add-hint">
          {locale === "zh"
            ? "教师角色密码建议至少 10 位。系统保留名 Admin、LiLaoshi、user1 不可重复创建。"
            : "Teacher passwords should be at least 10 characters. Admin, LiLaoshi and user1 are reserved."}
        </p>
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
          <div className="admin-rbac-table-wrap">
            <table className="admin-rbac-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "用户名" : "Username"}</th>
                  <th>{locale === "zh" ? "角色" : "Role"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const isSelf = currentUser?.id === row.id;
                  const isAdminUser = row.role === "admin";
                  const canToggle = !isSelf && !isAdminUser;
                  const canDelete = !isSelf && !isAdminUser;
                  const canGenerateLink = !row.disabled && !isAdminUser;
                  const busy =
                    savingId === row.id ||
                    deletingId === row.id ||
                    linkGeneratingId === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="admin-rbac-username">{row.username}</td>
                      <td>{row.role_label}</td>
                      <td>
                        {row.disabled
                          ? locale === "zh"
                            ? "已禁用"
                            : "Disabled"
                          : locale === "zh"
                            ? "正常"
                            : "Active"}
                      </td>
                      <td>
                        <div className="admin-user-actions">
                          {canGenerateLink ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary admin-user-btn"
                              disabled={busy}
                              onClick={() => void generateLoginLink(row)}
                            >
                              {linkGeneratingId === row.id
                                ? locale === "zh"
                                  ? "生成中…"
                                  : "Generating…"
                                : locale === "zh"
                                  ? "生成登录链接"
                                  : "Login link"}
                            </button>
                          ) : null}
                          {canToggle ? (
                            <button
                              type="button"
                              className={`btn-rsi-filter btn-rsi-filter--compact admin-user-btn${
                                row.disabled
                                  ? " btn-rsi-filter--success"
                                  : " btn-rsi-filter--danger"
                              }`}
                              disabled={busy}
                              onClick={() => void toggleDisabled(row)}
                            >
                              {savingId === row.id
                                ? locale === "zh"
                                  ? "处理中…"
                                  : "Saving…"
                                : row.disabled
                                  ? locale === "zh"
                                    ? "启用"
                                    : "Enable"
                                  : locale === "zh"
                                    ? "禁用"
                                    : "Disable"}
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger admin-user-btn"
                              disabled={busy}
                              onClick={() => void deleteUser(row)}
                            >
                              {deletingId === row.id
                                ? locale === "zh"
                                  ? "删除中…"
                                  : "Deleting…"
                                : locale === "zh"
                                  ? "删除"
                                  : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        .admin-user-add-section {
          margin-bottom: 1.25rem;
        }
        .admin-user-add-title {
          margin: 0 0 0.85rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .admin-user-add-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
          gap: 0.75rem 1rem;
          align-items: end;
        }
        .admin-user-add-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-user-add-field input,
        .admin-user-add-field select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
        }
        .admin-user-add-submit {
          justify-self: start;
          min-height: 2.35rem;
        }
        .admin-user-add-hint {
          margin: 0.75rem 0 0;
        }
        .admin-rbac-section {
          margin-bottom: 1.25rem;
        }
        .admin-rbac-table-wrap {
          overflow-x: auto;
        }
        .admin-rbac-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .admin-rbac-table th,
        .admin-rbac-table td {
          border: 1px solid var(--border);
          padding: 0.55rem 0.65rem;
          vertical-align: middle;
          text-align: left;
        }
        .admin-rbac-table th {
          background: var(--panel);
          font-weight: 600;
          white-space: nowrap;
        }
        .admin-rbac-table tbody tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .admin-rbac-username {
          font-weight: 600;
          white-space: nowrap;
        }
        .admin-user-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
        }
        .admin-user-btn {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
