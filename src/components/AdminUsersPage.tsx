"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  adminPath,
  adminRbacPath,
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
  const [linkGeneratingId, setLinkGeneratingId] = useState<number | null>(null);
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
          ? `已为 ${row.username} 生成一次性登录链接（30 天免登录）${copied ? "，已复制到剪贴板" : ""}：${url}`
          : `One-time login link for ${row.username} (${data.session_days ?? 30}-day session)${copied ? ", copied" : ""}: ${url}`
      );
    } catch {
      setStatus(locale === "zh" ? "生成链接失败" : "Failed to generate link");
      setStatusErr(true);
    } finally {
      setLinkGeneratingId(null);
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
            ? "禁用账号后，该用户登录或访问时将看到「你所访问的功能正在维护中，请稍后再试」。可为老师与普通用户生成一次性登录链接（30 天免登录）；Admin 账号仅自用，请直接密码登录。"
            : "Disabled accounts see a feature maintenance message. One-time login links are for teachers and regular users (30-day session). Admin accounts sign in with password only."}
        </p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminRbacPath(locale)}>{locale === "zh" ? "角色权限" : "Roles"}</a>
        </p>
      </div>

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section">
        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : users.length === 0 ? (
          <p className="hint">
            {locale === "zh"
              ? "暂无用户记录。账号首次登录后会出现在此表中。"
              : "No users yet. Accounts appear here after first login."}
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
                  const canGenerateLink = !row.disabled && !isAdminUser;
                  const busy =
                    savingId === row.id || linkGeneratingId === row.id;
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
                          ) : !canGenerateLink ? (
                            <span className="hint">—</span>
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
