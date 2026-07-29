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
import {
  emptyTeacherModules,
  type RbacTeacherModules,
} from "@/lib/rbac";
import { formatBeijingDateTime, parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import { formatIpForDisplay } from "@/lib/client-ip";

export const LOGIN_LINK_TEMPLATE_STORAGE_KEY = "admin_login_link_template_id";

export function readSelectedTemplateId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOGIN_LINK_TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function rememberSelectedTemplateId(id: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (id == null) {
      localStorage.removeItem(LOGIN_LINK_TEMPLATE_STORAGE_KEY);
    } else {
      localStorage.setItem(LOGIN_LINK_TEMPLATE_STORAGE_KEY, String(id));
    }
  } catch {
    /* ignore */
  }
}

export type UserRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
  teacher_modules?: RbacTeacherModules | null;
  jp_lesson_teacher_id?: number | null;
  jp_lesson_teacher_name?: string | null;
  disabled: boolean;
  never_disable?: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_login_ip?: string | null;
};

export type UserSortField = "id" | "last_login_at" | "disabled";
export type UserSortDirection = "asc" | "desc";

export function compareNullableText(a: string | null | undefined, b: string | null | undefined): number {
  const av = (a ?? "").trim();
  const bv = (b ?? "").trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, undefined, { sensitivity: "base" });
}

export function sortUsers(
  rows: UserRow[],
  field: UserSortField,
  direction: UserSortDirection
): UserRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (field === "id") {
      const diff = a.id - b.id;
      return diff === 0
        ? a.username.localeCompare(b.username, undefined, { sensitivity: "base" }) * factor
        : diff * factor;
    }

    if (field === "disabled") {
      // asc: 正常 → 已禁用；desc: 已禁用 → 正常
      const diff = Number(a.disabled) - Number(b.disabled);
      return diff === 0 ? (a.id - b.id) * factor : diff * factor;
    }

    const aTime = a.last_login_at ? parseStoredUtcDateTimeMs(a.last_login_at) : Number.NaN;
    const bTime = b.last_login_at ? parseStoredUtcDateTimeMs(b.last_login_at) : Number.NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (!aValid && !bValid) {
      return compareNullableText(a.last_login_ip, b.last_login_ip) * factor;
    }
    if (!aValid) return 1;
    if (!bValid) return -1;
    if (aTime !== bTime) return (aTime - bTime) * factor;
    return (a.id - b.id) * factor;
  });
}

export function matchesAdminUserSearch(
  row: UserRow,
  query: string,
  locale: "zh" | "en"
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const statusZh = row.disabled ? "已禁用" : "正常";
  const statusEn = row.disabled ? "disabled" : "active";
  const haystack = [
    String(row.id),
    row.username,
    row.role,
    row.role_label,
    row.jp_lesson_teacher_name ?? "",
    row.last_login_ip ?? "",
    locale === "zh" ? statusZh : statusEn,
    statusZh,
    statusEn,
    row.never_disable ? "永不禁用 never disable" : "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function formatAdminDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return formatBeijingDateTime(value);
}

/** 桌面表窄列：日期一行、时间一行（对齐新课 jp-lesson-dt-stacked） */
export function AdminUserDateTimeStacked({
  value,
}: {
  value: string | null | undefined;
}) {
  if (!value) return "—";
  const full = formatBeijingDateTime(value);
  const space = full.indexOf(" ");
  if (space < 0) {
    return <span className="admin-user-dt-stacked">{full}</span>;
  }
  return (
    <span className="admin-user-dt-stacked" title={full}>
      <span className="admin-user-dt-date">{full.slice(0, space)}</span>
      <span className="admin-user-dt-time">{full.slice(space + 1)}</span>
    </span>
  );
}

export function AdminUserCardField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`strategy-card-item${wide ? " strategy-card-item--wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** 长于该长度则默认收起，点「展开」看全文（IPv4 通常不触发） */
export const ADMIN_USER_IP_COLLAPSE_AT = 18;

/** 最后登录 IP：短地址一行展示；长 IPv6 默认折叠，可展开；下方可挂「查看历史登录 IP」 */
export function AdminUserIpDisplay({
  ip,
  locale,
  onViewHistory,
}: {
  ip: string | null | undefined;
  locale: "zh" | "en";
  onViewHistory?: () => void;
}) {
  const full = formatIpForDisplay(ip);
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = full !== "—" && full.length > ADMIN_USER_IP_COLLAPSE_AT;

  const historyBtn = onViewHistory ? (
    <button
      type="button"
      className="admin-user-ip-history"
      onClick={onViewHistory}
    >
      {locale === "zh" ? "查看历史登录IP" : "Login IP history"}
    </button>
  ) : null;

  if (full === "—") {
    return (
      <span className="admin-user-ip">
        <span className="admin-user-ip-text">—</span>
        {historyBtn}
      </span>
    );
  }

  if (!needsCollapse) {
    return (
      <span className="admin-user-ip" title={full}>
        <span className="admin-user-ip-text">{full}</span>
        {historyBtn}
      </span>
    );
  }

  const preview = `${full.slice(0, ADMIN_USER_IP_COLLAPSE_AT)}…`;
  return (
    <span
      className={`admin-user-ip${expanded ? " admin-user-ip--expanded" : " admin-user-ip--collapsed"}`}
    >
      <span className="admin-user-ip-text" title={full}>
        {expanded ? full : preview}
      </span>
      <button
        type="button"
        className="admin-user-ip-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? locale === "zh"
            ? "收起"
            : "Collapse"
          : locale === "zh"
            ? "展开"
            : "Expand"}
      </button>
      {historyBtn}
    </span>
  );
}

export type AdminUserActionsProps = {
  row: UserRow;
  locale: "zh" | "en";
  currentUserId: number | undefined;
  hasTemplates: boolean;
  deletingId: number | null;
  linkGeneratingId: number | null;
  linkGeneratingWithTemplate: boolean;
  copyingId: number | null;
  resettingId: number | null;
  onEdit: (row: UserRow) => void;
  onResetPassword: (row: UserRow) => void;
  onCopyCredentials: (row: UserRow) => void;
  onGenerateLoginLink: (row: UserRow) => void;
  onCopyWithTemplate: (row: UserRow) => void;
  onToggleNeverDisable: (row: UserRow) => void;
  onToggleDisabled: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
};

export function AdminUserActions({
  row,
  locale,
  currentUserId,
  hasTemplates,
  deletingId,
  linkGeneratingId,
  linkGeneratingWithTemplate,
  copyingId,
  resettingId,
  onEdit,
  onResetPassword,
  onCopyCredentials,
  onGenerateLoginLink,
  onCopyWithTemplate,
  onToggleNeverDisable,
  onToggleDisabled,
  onDelete,
}: AdminUserActionsProps) {
  const isSelf = currentUserId === row.id;
  const isAdminUser = row.role === "admin";
  const canToggle = !isSelf && !isAdminUser;
  const canEdit = !isAdminUser;
  const canDelete = !isSelf && !isAdminUser;
  const canGenerateLink = !row.disabled && !isAdminUser;
  const canCopyCredentials = !isAdminUser;
  const canResetPassword = !isAdminUser;
  const canToggleNeverDisable = !isAdminUser;
  const busy =
    deletingId === row.id ||
    linkGeneratingId === row.id ||
    copyingId === row.id ||
    resettingId === row.id;
  const neverDisable = Boolean(row.never_disable);

  return (
    <div className="admin-user-actions">
      {canToggleNeverDisable ? (
        <button
          type="button"
          className={`btn-rsi-filter btn-rsi-filter--compact admin-user-btn${
            neverDisable ? " btn-rsi-filter--success" : ""
          }`}
          disabled={busy}
          onClick={() => onToggleNeverDisable(row)}
          title={
            locale === "zh"
              ? neverDisable
                ? "取消后，课表/抽完等定时启禁会重新对该账号生效"
                : "开启后，课表启用、下课禁用、抽完禁用等定时任务一律跳过；手动启用/禁用仍可用"
              : neverDisable
                ? "After cancel, schedule/quiz auto enable/disable applies again"
                : "While on, schedule/quiz cron jobs skip this account; manual enable/disable still works"
          }
        >
          {neverDisable
            ? locale === "zh"
              ? "取消永不禁用"
              : "Allow auto-disable"
            : locale === "zh"
              ? "永不禁用"
              : "Never disable"}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
          disabled={busy}
          onClick={() => onEdit(row)}
        >
          {locale === "zh" ? "编辑" : "Edit"}
        </button>
      ) : null}
      {canResetPassword ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
          disabled={busy}
          onClick={() => void onResetPassword(row)}
          title={
            locale === "zh"
              ? "一键更换密码：旧密码立即失效并踢下线；新密码复制到剪贴板。系统保留账号（李老师 / user1）禁止"
              : "One-click password reset: old password stops working and sessions are signed out; new password is copied. Bootstrap accounts cannot be random-reset"
          }
        >
          {resettingId === row.id
            ? locale === "zh"
              ? "更换中…"
              : "Resetting…"
            : locale === "zh"
              ? "更换密码"
              : "Reset password"}
        </button>
      ) : null}
      {canCopyCredentials ? (
        <>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
            disabled={busy}
            onClick={() => void onCopyCredentials(row)}
            title={
              locale === "zh"
                ? "复制用户名与密码（密码来自本机缓存；系统保留账号如李老师无缓存时不会重置）"
                : "Copy username and password (from local cache; bootstrap accounts are never random-reset)"
            }
          >
            {copyingId === row.id
              ? locale === "zh"
                ? "处理中…"
                : "Working…"
              : locale === "zh"
                ? "复制账号密码"
                : "Copy credentials"}
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact admin-user-btn"
            disabled={busy || !hasTemplates}
            onClick={() => onCopyWithTemplate(row)}
            title={
              locale === "zh"
                ? hasTemplates
                  ? "先选择模板，再复制用户名、密码与抽查链接"
                  : "请先在「管理登录模板」中添加模板"
                : hasTemplates
                  ? "Pick a template, then copy username, password, and quiz link"
                  : "Add a template under Manage templates first"
            }
          >
            {linkGeneratingId === row.id && linkGeneratingWithTemplate
              ? locale === "zh"
                ? "复制中…"
                : "Copying…"
              : locale === "zh"
                ? "带模板复制"
                : "Copy with template"}
          </button>
        </>
      ) : null}
      {canGenerateLink ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary admin-user-btn"
          disabled={busy}
          onClick={() => void onGenerateLoginLink(row)}
          title={
            locale === "zh"
              ? "生成并复制登录链接"
              : "Generate and copy login link"
          }
        >
          {linkGeneratingId === row.id && !linkGeneratingWithTemplate
            ? locale === "zh"
              ? "生成中…"
              : "Generating…"
            : locale === "zh"
              ? "复制链接"
              : "Copy link"}
        </button>
      ) : null}
      {canToggle ? (
        <button
          type="button"
          className={`btn-rsi-filter btn-rsi-filter--compact admin-user-btn${
            row.disabled ? " btn-rsi-filter--success" : " btn-rsi-filter--danger"
          }`}
          disabled={busy}
          onClick={() => onToggleDisabled(row)}
        >
          {row.disabled
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
          onClick={() => void onDelete(row)}
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
  );
}

