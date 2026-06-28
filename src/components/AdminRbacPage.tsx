"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import type { EtrUserRole } from "@/lib/etr-auth";
import {
  RBAC_MANAGEABLE_ROLES,
  RBAC_ROLE_LABELS,
  rbacCategoryLabel,
  rbacPermissionLabel,
  type RbacPermissionCategory,
  type RbacPermissionDef,
} from "@/lib/rbac";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { adminPath, adminTrendsPath, adminUsersPath, adminToolCodesPath } from "@/lib/locale-path";

type RoleMatrix = {
  role: EtrUserRole;
  permissions: string[];
  manageable: boolean;
};

type UserRow = {
  id: number;
  username: string;
  role: EtrUserRole;
  created_at: string;
  permissions: string[];
};

const CATEGORY_ORDER: RbacPermissionCategory[] = ["admin", "pages", "jp", "nav"];
const EDITABLE_ROLES: EtrUserRole[] = ["jp_vocab", "user"];

function roleLabel(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.zh : item.en;
}

function permissionLabels(
  keys: string[],
  catalog: RbacPermissionDef[],
  locale: "en" | "zh"
): string[] {
  const map = new Map(catalog.map((p) => [p.key, p]));
  return keys.map((key) => {
    const def = map.get(key);
    return def ? rbacPermissionLabel(def, locale) : key;
  });
}

export function AdminRbacPage() {
  const { locale } = useI18n();
  const { isAdmin, hasPermission, checking } = useEtrAuth();
  const canManage = isAdmin || hasPermission("admin:rbac");

  const [catalog, setCatalog] = useState<RbacPermissionDef[]>([]);
  const [matrix, setMatrix] = useState<RoleMatrix[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [draftByRole, setDraftByRole] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);

  const groupedCatalog = useMemo(() => {
    const groups = new Map<RbacPermissionCategory, RbacPermissionDef[]>();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const item of catalog) {
      groups.get(item.category)?.push(item);
    }
    return groups;
  }, [catalog]);

  const adminPermissions = useMemo(
    () => matrix.find((m) => m.role === "admin")?.permissions ?? [],
    [matrix]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/rbac", { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "load failed"));
        setStatusErr(true);
        return;
      }
      setCatalog(data.catalog ?? []);
      setMatrix(data.matrix ?? []);
      setUsers(data.users ?? []);
      const nextDraft: Record<string, Set<string>> = {};
      for (const row of data.matrix ?? []) {
        if (RBAC_MANAGEABLE_ROLES.includes(row.role)) {
          nextDraft[row.role] = new Set(row.permissions ?? []);
        }
      }
      setDraftByRole(nextDraft);
    } catch {
      setStatus(locale === "zh" ? "加载失败" : "Load failed");
      setStatusErr(true);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (checking || !canManage) return;
    void load();
  }, [checking, canManage, load]);

  const toggleDraft = (role: EtrUserRole, key: string) => {
    if (!RBAC_MANAGEABLE_ROLES.includes(role)) return;
    setDraftByRole((prev) => {
      const next = { ...prev };
      const set = new Set(prev[role] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[role] = set;
      return next;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      for (const role of EDITABLE_ROLES) {
        const permissions = [...(draftByRole[role] ?? [])];
        const res = await fetch("/api/admin/rbac", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, permissions }),
        });
        const data = await res.json();
        if (!data.ok) {
          setStatus(String(data.error || "save failed"));
          setStatusErr(true);
          return;
        }
      }
      await load();
      setStatus(locale === "zh" ? "已保存" : "Saved");
    } catch {
      setStatus(locale === "zh" ? "保存失败" : "Save failed");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  if (checking || !canManage) {
    return (
      <AdminAuthGate
        title={locale === "zh" ? "角色权限管理" : "Role permissions"}
        required={locale === "zh" ? "请使用管理员账号登录。" : "Please log in as admin."}
        login={locale === "zh" ? "去登录" : "Log in"}
        registered={!checking && canManage}
      />
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{locale === "zh" ? "角色权限管理" : "Role permissions"}</h1>
        <p className="sub">
          {locale === "zh"
            ? "下方表格列出每个用户名及其有效权限。修改角色权限后，同角色下所有用户会一并生效。"
            : "Tables below show each username and effective permissions. Role changes apply to all users with that role."}
        </p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminUsersPath(locale)}>{locale === "zh" ? "用户管理" : "Users"}</a>
          {" · "}
          <a href={adminToolCodesPath(locale)}>{locale === "zh" ? "工具发码" : "Tool codes"}</a>
        </p>
      </div>

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section">
        <h2 className="admin-rbac-section-title">
          {locale === "zh" ? "用户权限一览" : "Users & permissions"}
        </h2>
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
                  <th>{locale === "zh" ? "权限" : "Permissions"}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="admin-rbac-username">{user.username}</td>
                    <td>{roleLabel(user.role, locale)}</td>
                    <td>
                      <div className="admin-rbac-tags">
                        {permissionLabels(user.permissions, catalog, locale).map(
                          (label) => (
                            <span key={`${user.id}-${label}`} className="admin-rbac-tag">
                              {label}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section etr-panel admin-rbac-section">
        <h2 className="admin-rbac-section-title">
          {locale === "zh" ? "按角色配置权限" : "Permissions by role"}
        </h2>
        <p className="hint" style={{ marginBottom: "0.75rem" }}>
          {locale === "zh"
            ? "管理员始终拥有全部权限（不可改）。勾选后点击保存，会更新该角色下所有用户（如上表）。"
            : "Admin always has full access (read-only). Saving updates all users with that role."}
        </p>

        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : (
          <>
            {[...groupedCatalog.entries()].map(([category, items]) =>
              items.length ? (
                <div key={category} className="admin-rbac-group">
                  <h3 className="admin-rbac-group-title">
                    {rbacCategoryLabel(category, locale)}
                  </h3>
                  <div className="admin-rbac-table-wrap">
                    <table className="admin-rbac-table admin-rbac-matrix">
                      <thead>
                        <tr>
                          <th>{locale === "zh" ? "权限" : "Permission"}</th>
                          <th>{roleLabel("admin", locale)}</th>
                          {EDITABLE_ROLES.map((role) => (
                            <th key={role}>{roleLabel(role, locale)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((perm) => (
                          <tr key={perm.key}>
                            <td>
                              <strong>{rbacPermissionLabel(perm, locale)}</strong>
                              <span className="admin-rbac-key">{perm.key}</span>
                            </td>
                            <td className="admin-rbac-check-cell">
                              <input
                                type="checkbox"
                                checked={adminPermissions.includes(perm.key)}
                                disabled
                                readOnly
                                aria-label={`admin-${perm.key}`}
                              />
                            </td>
                            {EDITABLE_ROLES.map((role) => (
                              <td key={role} className="admin-rbac-check-cell">
                                <input
                                  type="checkbox"
                                  checked={draftByRole[role]?.has(perm.key) ?? false}
                                  onChange={() => toggleDraft(role, perm.key)}
                                  aria-label={`${role}-${perm.key}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null
            )}

            <div className="etr-form-actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary"
                disabled={saving}
                onClick={() => void saveAll()}
              >
                {saving
                  ? locale === "zh"
                    ? "保存中…"
                    : "Saving…"
                  : locale === "zh"
                    ? "保存角色权限"
                    : "Save role permissions"}
              </button>
            </div>
          </>
        )}
      </section>

      <style jsx>{`
        .admin-rbac-section {
          margin-bottom: 1.25rem;
        }
        .admin-rbac-section-title {
          font-size: 1.125rem;
          margin: 0 0 0.75rem;
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
          vertical-align: top;
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
        .admin-rbac-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .admin-rbac-tag {
          display: inline-block;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--panel);
          font-size: 0.8125rem;
          line-height: 1.35;
        }
        .admin-rbac-group {
          margin-top: 1.25rem;
        }
        .admin-rbac-group-title {
          font-size: 0.9375rem;
          margin: 0 0 0.5rem;
        }
        .admin-rbac-key {
          display: block;
          font-size: 0.75rem;
          color: var(--muted);
          font-family: ui-monospace, monospace;
          font-weight: normal;
        }
        .admin-rbac-check-cell {
          text-align: center;
          width: 6rem;
        }
        .admin-rbac-matrix td:first-child {
          min-width: 12rem;
        }
      `}</style>
    </div>
  );
}
