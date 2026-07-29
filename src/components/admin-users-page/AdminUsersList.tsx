"use client";

import type { ReactNode } from "react";
import type { Locale } from "@/i18n/messages";
import {
  AdminUserActions,
  AdminUserCardField,
  AdminUserDateTimeStacked,
  AdminUserIpDisplay,
  formatAdminDateTime,
  type UserRow,
  type UserSortField,
} from "@/components/admin-users-page/admin-users-page-helpers";

export type AdminUsersListProps = {
  locale: Locale;
  loading: boolean;
  refreshing: boolean;
  users: UserRow[];
  filteredUsers: UserRow[];
  searchQuery: string;
  searchActive: boolean;
  onSearchQueryChange: (value: string) => void;
  sortField: UserSortField;
  sortLabel: (field: UserSortField) => string;
  onToggleSort: (field: UserSortField) => void;
  highlightUserId: number | null;
  currentUserId: number | undefined;
  hasTemplates: boolean;
  deletingId: number | null;
  linkGeneratingId: number | null;
  linkGeneratingWithTemplate: boolean;
  copyingId: number | null;
  onBindTeacher: (row: UserRow) => void;
  onEdit: (row: UserRow) => void;
  onViewLoginHistory: (row: UserRow) => void;
  onResetPassword: (row: UserRow) => void;
  onCopyCredentials: (row: UserRow) => void;
  onGenerateLoginLink: (row: UserRow) => void;
  onCopyWithTemplate: (row: UserRow) => void;
  onToggleNeverDisable: (row: UserRow) => void;
  onToggleDisabled: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
};

export function AdminUsersList({
  locale,
  loading,
  refreshing,
  users,
  filteredUsers,
  searchQuery,
  searchActive,
  onSearchQueryChange,
  sortField,
  sortLabel,
  onToggleSort,
  highlightUserId,
  currentUserId,
  hasTemplates,
  deletingId,
  linkGeneratingId,
  linkGeneratingWithTemplate,
  copyingId,
  onBindTeacher,
  onEdit,
  onViewLoginHistory,
  onResetPassword,
  onCopyCredentials,
  onGenerateLoginLink,
  onCopyWithTemplate,
  onToggleNeverDisable,
  onToggleDisabled,
  onDelete,
}: AdminUsersListProps) {
  const renderTeacherCell = (row: UserRow) => {
    const teacherName = row.jp_lesson_teacher_name?.trim() || "";
    if (!teacherName) {
      return (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary admin-user-bind-teacher-btn"
          onClick={() => onBindTeacher(row)}
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
          onClick={() => onBindTeacher(row)}
        >
          {locale === "zh" ? "更改" : "Change"}
        </button>
      </span>
    );
  };

  return (
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
                  onChange={(e) => onSearchQueryChange(e.target.value)}
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
                  onClick={() => onSearchQueryChange("")}
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
                onClick={() => onToggleSort("id")}
              >
                {locale === "zh" ? "ID" : "ID"}
                {sortLabel("id")}
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact admin-users-mobile-sort-btn${
                  sortField === "last_login_at" ? " btn-rsi-filter--primary" : ""
                }`}
                onClick={() => onToggleSort("last_login_at")}
              >
                {locale === "zh" ? "最近登录" : "Last login"}
                {sortLabel("last_login_at")}
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact admin-users-mobile-sort-btn${
                  sortField === "disabled" ? " btn-rsi-filter--primary" : ""
                }`}
                onClick={() => onToggleSort("disabled")}
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
                      value={
                        <AdminUserIpDisplay
                          ip={row.last_login_ip}
                          locale={locale}
                          onViewHistory={() => onViewLoginHistory(row)}
                        />
                      }
                      wide
                    />
                  </dl>
                  <AdminUserActions
                    row={row}
                    locale={locale}
                    currentUserId={currentUserId}
                    hasTemplates={hasTemplates}
                    deletingId={deletingId}
                    linkGeneratingId={linkGeneratingId}
                    linkGeneratingWithTemplate={linkGeneratingWithTemplate}
                    copyingId={copyingId}
                    onEdit={onEdit}
                    onResetPassword={onResetPassword}
                    onCopyCredentials={onCopyCredentials}
                    onGenerateLoginLink={onGenerateLoginLink}
                    onCopyWithTemplate={onCopyWithTemplate}
                    onToggleNeverDisable={onToggleNeverDisable}
                    onToggleDisabled={onToggleDisabled}
                    onDelete={onDelete}
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
                        onClick={() => onToggleSort("id")}
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
                        onClick={() => onToggleSort("last_login_at")}
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
                        onClick={() => onToggleSort("disabled")}
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
                      <td className="admin-user-col-created">
                        <AdminUserDateTimeStacked value={row.created_at} />
                      </td>
                      <td className="admin-user-col-login">
                        <AdminUserDateTimeStacked value={row.last_login_at} />
                      </td>
                      <td className="admin-user-ip-col">
                        <AdminUserIpDisplay
                          ip={row.last_login_ip}
                          locale={locale}
                          onViewHistory={() => onViewLoginHistory(row)}
                        />
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
                          currentUserId={currentUserId}
                          hasTemplates={hasTemplates}
                          deletingId={deletingId}
                          linkGeneratingId={linkGeneratingId}
                          linkGeneratingWithTemplate={linkGeneratingWithTemplate}
                          copyingId={copyingId}
                          onEdit={onEdit}
                          onResetPassword={onResetPassword}
                          onCopyCredentials={onCopyCredentials}
                          onGenerateLoginLink={onGenerateLoginLink}
                          onCopyWithTemplate={onCopyWithTemplate}
                          onToggleNeverDisable={onToggleNeverDisable}
                          onToggleDisabled={onToggleDisabled}
                          onDelete={onDelete}
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
  );
}
