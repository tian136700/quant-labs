"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import type { EtrUserRole } from "@/lib/etr-auth";
import {
  RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS,
  RBAC_MANAGEABLE_ROLES,
  RBAC_ROLE_LABELS,
  RBAC_UI_LAYOUT,
  rbacCategoryLabel,
  rbacModuleLabel,
  rbacPermissionDescription,
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

const ALL_ROLES: EtrUserRole[] = ["admin", "jp_vocab", "en_vocab", "user"];

function roleLabel(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.zh : item.en;
}

function roleDescription(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.descriptionZh : item.descriptionEn;
}

function matchesSearch(
  perm: RbacPermissionDef,
  query: string,
  locale: "en" | "zh"
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    perm.key,
    rbacPermissionLabel(perm, locale),
    rbacPermissionDescription(perm, locale),
    rbacCategoryLabel(perm.category, locale),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function permissionLabels(
  keys: string[],
  catalog: RbacPermissionDef[],
  locale: "en" | "zh"
): string[] {
  const map = new Map(catalog.map((p) => [p.key, p]));
  return keys.map((key) => {
    const def = map.get(key);
    if (!def) return key;
    const group = rbacCategoryLabel(def.category, locale);
    return `${group} · ${rbacPermissionLabel(def, locale)}`;
  });
}

function sortedKeys(set: Set<string> | undefined): string[] {
  return [...(set ?? [])].sort();
}

function RolePermissionList({
  items,
  locale,
  role,
  checkedKeys,
  onToggle,
  readOnly,
  excludedKeys,
}: {
  items: RbacPermissionDef[];
  locale: "en" | "zh";
  role: EtrUserRole;
  checkedKeys: Set<string>;
  onToggle: (key: string) => void;
  readOnly: boolean;
  excludedKeys?: Set<string>;
}) {
  if (!items.length) return null;

  return (
    <ul className="admin-rbac-perm-list">
      {items.map((perm) => {
        const excluded = excludedKeys?.has(perm.key) ?? false;
        const disabled = readOnly || excluded;
        const checked = readOnly ? true : excluded ? false : checkedKeys.has(perm.key);
        return (
          <li key={perm.key} className="admin-rbac-perm-row">
            <label
              className={`admin-rbac-perm-row-label${disabled ? " admin-rbac-perm-row-label--locked" : ""}`}
            >
              <input
                type="checkbox"
                className="admin-rbac-check"
                checked={checked}
                disabled={disabled}
                readOnly={disabled}
                onChange={() => onToggle(perm.key)}
                aria-label={`${role}-${perm.key}`}
              />
              <div className="admin-rbac-perm-row-body">
                <div className="admin-rbac-perm-name">
                  {rbacPermissionLabel(perm, locale)}
                </div>
                <div className="admin-rbac-perm-desc">
                  {rbacPermissionDescription(perm, locale)}
                </div>
                {excluded ? (
                  <span className="admin-rbac-perm-excluded-hint">
                    {locale === "zh"
                      ? "日语教师角色不可分配新课权限"
                      : "Not assignable to JP teacher role"}
                  </span>
                ) : null}
                <code className="admin-rbac-perm-key">{perm.key}</code>
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminRbacPage() {
  const { locale } = useI18n();
  const { isAdmin, hasPermission, checking } = useEtrAuth();
  const canManage = isAdmin || hasPermission("admin:rbac");

  const [catalog, setCatalog] = useState<RbacPermissionDef[]>([]);
  const [matrix, setMatrix] = useState<RoleMatrix[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [draftByRole, setDraftByRole] = useState<Record<string, Set<string>>>({});
  const [selectedRole, setSelectedRole] = useState<EtrUserRole>("jp_vocab");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [search, setSearch] = useState("");

  const groupedCatalog = useMemo(() => {
    const groups = new Map<RbacPermissionCategory, RbacPermissionDef[]>();
    for (const section of RBAC_UI_LAYOUT) {
      if (section.kind === "category") groups.set(section.category, []);
      else {
        for (const cat of section.categories) groups.set(cat, []);
      }
    }
    for (const item of catalog) {
      groups.get(item.category)?.push(item);
    }
    return groups;
  }, [catalog]);

  const filterItems = useCallback(
    (items: RbacPermissionDef[]) =>
      items.filter((item) => matchesSearch(item, search, locale)),
    [search, locale]
  );

  const userCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const role of ALL_ROLES) counts[role] = 0;
    for (const user of users) {
      counts[user.role] = (counts[user.role] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const selectedRoleUsers = useMemo(
    () => users.filter((user) => user.role === selectedRole),
    [users, selectedRole]
  );

  const selectedRoleReadOnly = selectedRole === "admin";

  const roleExcludedKeys = useMemo(() => {
    if (selectedRole === "jp_vocab") {
      return new Set<string>(RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS);
    }
    if (selectedRole === "en_vocab") {
      return new Set<string>(RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS);
    }
    return new Set<string>();
  }, [selectedRole]);

  const selectedDraft = useMemo(
    () => draftByRole[selectedRole] ?? new Set<string>(),
    [draftByRole, selectedRole]
  );

  const selectedSaved = useMemo(
    () => matrix.find((m) => m.role === selectedRole)?.permissions ?? [],
    [matrix, selectedRole]
  );

  const isDirty = useMemo(() => {
    if (selectedRoleReadOnly) return false;
    return (
      JSON.stringify(sortedKeys(selectedDraft)) !==
      JSON.stringify([...selectedSaved].sort())
    );
  }, [selectedDraft, selectedSaved, selectedRoleReadOnly]);

  const selectedCheckedCount = useMemo(() => {
    if (selectedRoleReadOnly) return catalog.length;
    return selectedDraft.size;
  }, [selectedRoleReadOnly, selectedDraft, catalog.length]);

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
          let perms = row.permissions ?? [];
          if (row.role === "jp_vocab") {
            const excluded = new Set<string>(RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS);
            perms = perms.filter((key: string) => !excluded.has(key));
          }
          if (row.role === "en_vocab") {
            const excluded = new Set<string>(RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS);
            perms = perms.filter((key: string) => !excluded.has(key));
          }
          nextDraft[row.role] = new Set(perms);
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

  const toggleDraft = (key: string) => {
    if (selectedRoleReadOnly || !RBAC_MANAGEABLE_ROLES.includes(selectedRole)) return;
    if (roleExcludedKeys.has(key)) return;
    setDraftByRole((prev) => {
      const next = { ...prev };
      const set = new Set(prev[selectedRole] ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[selectedRole] = set;
      return next;
    });
  };

  const resetSelectedRole = () => {
    if (selectedRoleReadOnly) return;
    setDraftByRole((prev) => ({
      ...prev,
      [selectedRole]: new Set(selectedSaved),
    }));
  };

  const saveSelectedRole = async () => {
    if (selectedRoleReadOnly || !RBAC_MANAGEABLE_ROLES.includes(selectedRole)) return;
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const permissions = [...(draftByRole[selectedRole] ?? [])];
      const res = await fetch("/api/admin/rbac", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole, permissions }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(String(data.error || "save failed"));
        setStatusErr(true);
        return;
      }
      await load();
      setStatus(
        locale === "zh"
          ? `已保存「${roleLabel(selectedRole, locale)}」的权限`
          : `Saved permissions for ${roleLabel(selectedRole, locale)}`
      );
    } catch {
      setStatus(locale === "zh" ? "保存失败" : "Save failed");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const renderPermissionGroups = () => {
    const groups = RBAC_UI_LAYOUT.map((section) => {
      if (section.kind === "category") {
        const items = filterItems(groupedCatalog.get(section.category) ?? []);
        if (!items.length) return null;
        return (
          <div key={section.category} className="admin-rbac-group">
            <div className="admin-rbac-group-head">
              <h3 className="admin-rbac-group-title">
                {rbacCategoryLabel(section.category, locale)}
              </h3>
              <span className="admin-rbac-count-badge">
                {items.filter((p) => selectedRoleReadOnly || selectedDraft.has(p.key)).length}
                /{items.length}
              </span>
            </div>
            <RolePermissionList
              items={items}
              locale={locale}
              role={selectedRole}
              checkedKeys={selectedDraft}
              onToggle={toggleDraft}
              readOnly={selectedRoleReadOnly}
              excludedKeys={roleExcludedKeys}
            />
          </div>
        );
      }

      const subsections = section.categories
        .map((category) => ({
          category,
          items: filterItems(groupedCatalog.get(category) ?? []),
        }))
        .filter((entry) => entry.items.length > 0);
      if (!subsections.length) return null;

      return (
        <div key={section.module} className="admin-rbac-module">
          <h3 className="admin-rbac-module-title">
            {rbacModuleLabel(section.module, locale)}
          </h3>
          {subsections.map(({ category, items }) => (
            <div key={category} className="admin-rbac-group admin-rbac-group--nested">
              <div className="admin-rbac-group-head">
                <h4 className="admin-rbac-group-title admin-rbac-subgroup-title">
                  {rbacCategoryLabel(category, locale)}
                </h4>
                <span className="admin-rbac-count-badge">
                  {items.filter((p) => selectedRoleReadOnly || selectedDraft.has(p.key)).length}
                  /{items.length}
                </span>
              </div>
              <RolePermissionList
                items={items}
                locale={locale}
                role={selectedRole}
                checkedKeys={selectedDraft}
                onToggle={toggleDraft}
                readOnly={selectedRoleReadOnly}
                excludedKeys={roleExcludedKeys}
              />
            </div>
          ))}
        </div>
      );
    });

    const hasAny =
      search.trim() === "" ||
      RBAC_UI_LAYOUT.some((section) => {
        if (section.kind === "category") {
          return filterItems(groupedCatalog.get(section.category) ?? []).length > 0;
        }
        return section.categories.some(
          (cat) => filterItems(groupedCatalog.get(cat) ?? []).length > 0
        );
      });

    if (!hasAny) {
      return (
        <p className="hint admin-rbac-empty">
          {locale === "zh" ? "没有匹配的权限。" : "No permissions match your search."}
        </p>
      );
    }

    return groups;
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
            ? "先选择角色，勾选该角色可使用的功能，保存后该角色下所有用户立即生效。"
            : "Pick a role, check the features it may use, then save — all users with that role update immediately."}
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
        <p
          className={
            statusErr
              ? "telegram-push-result telegram-push-result--err admin-rbac-status"
              : "telegram-push-result telegram-push-result--ok admin-rbac-status"
          }
        >
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section">
        <div className="admin-rbac-section-head">
          <h2 className="admin-rbac-section-title">
            {locale === "zh" ? "编辑角色权限" : "Edit role permissions"}
          </h2>
        </div>

        <p className="admin-rbac-step-label">
          {locale === "zh" ? "第 1 步：选择角色" : "Step 1: Choose a role"}
        </p>
        <div className="admin-rbac-role-tabs" role="tablist">
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={selectedRole === role}
              className={`admin-rbac-role-tab${selectedRole === role ? " is-active" : ""}`}
              onClick={() => setSelectedRole(role)}
            >
              <span className={`admin-rbac-role-badge admin-rbac-role-badge--${role}`}>
                {roleLabel(role, locale)}
              </span>
              <span className="admin-rbac-role-tab-meta">
                {locale === "zh"
                  ? `${userCountByRole[role] ?? 0} 人`
                  : `${userCountByRole[role] ?? 0} users`}
              </span>
            </button>
          ))}
        </div>

        <div className="admin-rbac-role-panel">
          <div className="admin-rbac-role-panel-head">
            <p className="admin-rbac-role-desc">{roleDescription(selectedRole, locale)}</p>
            {selectedRoleReadOnly ? (
              <span className="admin-rbac-role-lock-badge">
                {locale === "zh" ? "全部权限 · 不可编辑" : "Full access · read-only"}
              </span>
            ) : (
              <span className="admin-rbac-role-count-badge">
                {locale === "zh"
                  ? `已勾选 ${selectedCheckedCount} / ${catalog.length} 项`
                  : `${selectedCheckedCount} / ${catalog.length} enabled`}
                {isDirty ? (
                  <span className="admin-rbac-dirty-dot" title={locale === "zh" ? "未保存" : "Unsaved"} />
                ) : null}
              </span>
            )}
          </div>

          {selectedRoleReadOnly ? (
            <div className="admin-rbac-callout">
              {locale === "zh"
                ? "管理员始终拥有全部权限，此处仅供查看，无法取消勾选。"
                : "Admins always have full access. This view is read-only."}
            </div>
          ) : (
            <div className="admin-rbac-callout">
              {locale === "zh"
                ? `勾选下方权限并点击「保存」，会更新所有「${roleLabel(selectedRole, locale)}」用户（共 ${userCountByRole[selectedRole] ?? 0} 人）。`
                : `Check permissions below and save to update all ${roleLabel(selectedRole, locale)} users (${userCountByRole[selectedRole] ?? 0}).`}
            </div>
          )}

          <p className="admin-rbac-step-label">
            {locale === "zh" ? "第 2 步：勾选权限" : "Step 2: Toggle permissions"}
          </p>

          <div className="admin-rbac-toolbar admin-rbac-toolbar--inline">
            <label className="admin-rbac-search-field">
              <span className="admin-rbac-search-label">
                {locale === "zh" ? "搜索权限" : "Search permissions"}
              </span>
              <input
                type="search"
                className="admin-rbac-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  locale === "zh" ? "名称、描述或 key…" : "Name, description, or key…"
                }
              />
            </label>
            {search.trim() ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact admin-rbac-search-clear"
                onClick={() => setSearch("")}
              >
                {locale === "zh" ? "清除" : "Clear"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
          ) : (
            <div className="admin-rbac-perm-groups">{renderPermissionGroups()}</div>
          )}

          {!selectedRoleReadOnly ? (
            <div className="admin-rbac-save-bar">
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary"
                disabled={saving || !isDirty}
                onClick={() => void saveSelectedRole()}
              >
                {saving
                  ? locale === "zh"
                    ? "保存中…"
                    : "Saving…"
                  : locale === "zh"
                    ? `保存「${roleLabel(selectedRole, locale)}」权限`
                    : `Save ${roleLabel(selectedRole, locale)}`}
              </button>
              <button
                type="button"
                className="btn-rsi-filter"
                disabled={saving || !isDirty}
                onClick={resetSelectedRole}
              >
                {locale === "zh" ? "撤销修改" : "Discard changes"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section etr-panel admin-rbac-section">
        <div className="admin-rbac-section-head">
          <h2 className="admin-rbac-section-title">
            {locale === "zh"
              ? `「${roleLabel(selectedRole, locale)}」下的用户`
              : `Users with role: ${roleLabel(selectedRole, locale)}`}
          </h2>
          {!loading ? (
            <span className="admin-rbac-count-badge">
              {selectedRoleUsers.length}
              {locale === "zh" ? " 人" : " users"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : selectedRoleUsers.length === 0 ? (
          <p className="hint admin-rbac-empty">
            {locale === "zh"
              ? "该角色下暂无用户。可在「用户管理」中创建或调整用户角色。"
              : "No users with this role yet. Assign roles in User management."}
          </p>
        ) : (
          <div className="admin-rbac-users-wrap">
            <table className="admin-rbac-users-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "用户名" : "Username"}</th>
                  <th>{locale === "zh" ? "有效权限" : "Effective permissions"}</th>
                </tr>
              </thead>
              <tbody>
                {selectedRoleUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="admin-rbac-username">{user.username}</td>
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
    </div>
  );
}
