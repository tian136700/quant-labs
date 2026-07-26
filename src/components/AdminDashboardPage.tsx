"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/messages";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { geoLocationDisplay } from "@/lib/geoip";
import { copyTextToClipboard } from "@/lib/copy-text";
import { visitLogIpDisplay, visitLogUsernameDisplay } from "@/lib/visit-log-display";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { CopyToast } from "@/components/CopyToast";
import { adminTrendsPath, adminRbacPath, adminUsersPath, adminToolCodesPath, adminJpLessonTeachersPath } from "@/lib/locale-path";
import type { UserFeedbackRecord, VisitLogRecord } from "@/lib/types";
import {
  VISIT_LOG_USERNAME_UNREGISTERED,
  parseVisitLogSortField,
  type VisitLogSortField,
} from "@/lib/analytics-db";
import {
  AdminVisitSortTh,
  nextVisitSortState,
  type AdminVisitSortState,
} from "@/components/admin-dashboard/AdminVisitSortTh";

const VISIT_PAGE_SIZE = 50;

const DEFAULT_VISIT_SORT: AdminVisitSortState = {
  field: "created_at",
  order: "desc",
};

function AdminCardField({
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

/** 点击 IP 复制到剪贴板；空值仅展示 — */
function AdminIpCopyButton({
  ip,
  locale,
  onCopied,
}: {
  ip: string | null | undefined;
  locale: Locale;
  onCopied: (message: string) => void;
}) {
  const display = visitLogIpDisplay(ip);
  const copyValue = display === "—" ? "" : display;

  if (!copyValue) {
    return <span>{display}</span>;
  }

  return (
    <button
      type="button"
      className="admin-ip-copy-btn"
      title={
        locale === "zh"
          ? `${display}（点击复制）`
          : `${display} (click to copy)`
      }
      onClick={() => {
        void copyTextToClipboard(copyValue).then((ok) =>
          onCopied(
            ok
              ? locale === "zh"
                ? "复制成功"
                : "Copied"
              : locale === "zh"
                ? "复制失败"
                : "Copy failed"
          )
        );
      }}
    >
      {display}
    </button>
  );
}

export function AdminDashboardPage() {
  const { locale, t, tf } = useI18n();
  const adm = t("adminDashboard");
  const admTrends = t("adminTrends");
  const { isAdmin, hasPermission, checking } = useEtrAuth();
  const canAccess = isAdmin || hasPermission("admin:dashboard");
  const canViewRbac = isAdmin || hasPermission("admin:rbac");

  const [visits, setVisits] = useState<VisitLogRecord[]>([]);
  const [visitPage, setVisitPage] = useState(1);
  const [visitTotal, setVisitTotal] = useState(0);
  const [visitTotalPages, setVisitTotalPages] = useState(1);
  const [visitSort, setVisitSort] = useState<AdminVisitSortState>(DEFAULT_VISIT_SORT);
  const [visitUsernameDraft, setVisitUsernameDraft] = useState("");
  const [visitUsernameFilter, setVisitUsernameFilter] = useState("");
  const [visitUsernameOptions, setVisitUsernameOptions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<UserFeedbackRecord[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "err">("");
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const loadVisits = useCallback(
    async (
      page = 1,
      sort: AdminVisitSortState = DEFAULT_VISIT_SORT,
      usernameFilter = visitUsernameFilter
    ) => {
      setLoadingVisits(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(VISIT_PAGE_SIZE),
          sort: sort.field,
          order: sort.order,
        });
        if (usernameFilter) {
          params.set("username", usernameFilter);
        }
        const res = await fetch(`/api/analytics/visits?${params}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) {
          setStatus(data.error || adm.status.loadFailed);
          setStatusKind("err");
          return;
        }
        setVisits(data.records ?? []);
        setVisitPage(data.page ?? page);
        setVisitTotal(data.total ?? 0);
        setVisitTotalPages(data.totalPages ?? 1);
        setVisitSort({
          field: parseVisitLogSortField(
            typeof data.sort === "string" ? data.sort : sort.field
          ),
          order: data.order === "asc" ? "asc" : "desc",
        });
        setVisitUsernameOptions(data.usernames ?? []);
        const applied =
          typeof data.usernameFilter === "string" ? data.usernameFilter : "";
        setVisitUsernameFilter(applied);
        setVisitUsernameDraft(applied);
      } catch {
        setStatus(adm.status.loadFailed);
        setStatusKind("err");
      } finally {
        setLoadingVisits(false);
      }
    },
    [adm.status.loadFailed, visitUsernameFilter]
  );

  const loadFeedback = useCallback(async () => {
    setLoadingFeedback(true);
    try {
      const res = await fetch("/api/feedback", { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || adm.status.loadFailed);
        setStatusKind("err");
        return;
      }
      setFeedback(data.records ?? []);
    } catch {
      setStatus(adm.status.loadFailed);
      setStatusKind("err");
    } finally {
      setLoadingFeedback(false);
    }
  }, [adm.status.loadFailed]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadVisits(1, DEFAULT_VISIT_SORT), loadFeedback()]);
  }, [loadVisits, loadFeedback]);

  const handleVisitSort = (field: VisitLogSortField) => {
    const next = nextVisitSortState(visitSort, field);
    setVisitSort(next);
    void loadVisits(1, next, visitUsernameFilter);
  };

  const handleVisitUsernameFilterChange = (value: string) => {
    setVisitUsernameDraft(value);
    setVisitUsernameFilter(value);
    void loadVisits(1, visitSort, value);
  };

  useEffect(() => {
    if (checking || !canAccess) return;
    void loadAll();
  }, [checking, canAccess, loadAll]);

  if (checking || !canAccess) {
    return (
      <AdminAuthGate
        title={adm.page.title}
        required={adm.auth.required}
        login={adm.auth.login}
        registered={!checking && canAccess}
      />
    );
  }

  const statusClass =
    statusKind === "err" ? "telegram-push-result telegram-push-result--err" : "";

  return (
    <div className="admin-page">
      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />
      <div className="page-hero">
        <h1>{adm.page.title}</h1>
        <AdminAuthUserStatus registered={canAccess} />
        <p className="sub">{adm.page.subtitle}</p>
        <p className="hint">
          <a href={adminTrendsPath(locale)}>{admTrends.page.title} →</a>
          {canViewRbac ? (
            <>
              {" · "}
              <a href={adminRbacPath(locale)}>
                {locale === "zh" ? "角色权限管理 →" : "Role permissions →"}
              </a>
            </>
          ) : null}
          {isAdmin ? (
            <>
              {" · "}
              <a href={adminUsersPath(locale)}>
                {locale === "zh" ? "用户管理 →" : "User management →"}
              </a>
              {" · "}
              <a href={adminToolCodesPath(locale)}>
                {locale === "zh" ? "工具发码 →" : "Tool codes →"}
              </a>
              {" · "}
              <a href={adminJpLessonTeachersPath(locale)}>
                {locale === "zh" ? "人员管理 →" : "Personnel →"}
              </a>
            </>
          ) : null}
        </p>
      </div>

      {status ? <p className={statusClass}>{status}</p> : null}

      <section className="section etr-panel">
        <div className="etr-history-head admin-visits-head">
          <h2>{adm.visits.heading}</h2>
          <div className="admin-visits-toolbar">
            <label className="admin-visits-filter">
              <span className="admin-visits-filter-label">{adm.visits.filterLabel}</span>
              <select
                className="admin-visits-filter-select"
                value={visitUsernameDraft}
                onChange={(event) =>
                  handleVisitUsernameFilterChange(event.target.value)
                }
                disabled={loadingVisits}
              >
                <option value="">{adm.visits.filterAll}</option>
                <option value={VISIT_LOG_USERNAME_UNREGISTERED}>
                  {adm.visits.filterUnregistered}
                </option>
                {visitUsernameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!loadingVisits && visitTotal === 0 ? (
          <p className="hint">{adm.visits.empty}</p>
        ) : visitTotal > 0 ? (
          <>
            <div className="admin-cards">
              {visits.map((row) => (
                <article key={row.id} className="strategy-card admin-card">
                  <h3 className="strategy-card-title">
                    #{row.id}
                    <span className="admin-card-meta">
                      {formatBeijingDateTime(row.created_at)}
                    </span>
                  </h3>
                  <dl className="strategy-card-grid">
                    <AdminCardField
                      label={adm.visits.ip}
                      value={
                        <AdminIpCopyButton
                          ip={row.ip}
                          locale={locale}
                          onCopied={setCopyToast}
                        />
                      }
                    />
                    <AdminCardField
                      label={adm.visits.ipVisitCount}
                      value={row.ip_visit_count ?? "—"}
                    />
                    <AdminCardField
                      label={adm.visits.username}
                      value={visitLogUsernameDisplay(row.username, locale)}
                    />
                    <AdminCardField
                      label={adm.visits.country}
                      value={geoLocationDisplay(row, locale)}
                    />
                    <AdminCardField label={adm.visits.eventType} value={row.event_type} />
                    <AdminCardField label={adm.visits.locale} value={row.locale ?? "—"} />
                    <AdminCardField label={adm.visits.url} value={row.url_path} wide />
                    <AdminCardField
                      label={adm.visits.eventDetail}
                      value={row.event_detail ?? "—"}
                      wide
                    />
                    <AdminCardField
                      label={adm.visits.time}
                      value={formatBeijingDateTime(row.created_at)}
                      wide
                    />
                    <AdminCardField
                      label={adm.visits.updatedAt}
                      value={formatBeijingDateTime(
                        row.updated_at ?? row.created_at
                      )}
                      wide
                    />
                  </dl>
                </article>
              ))}
            </div>

            <div className="admin-table-wrap">
            <table className="compare-table etr-table admin-table">
              <thead>
                <tr>
                  <AdminVisitSortTh
                    field="id"
                    label={adm.visits.id}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="ip"
                    label={adm.visits.ip}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="ip_visit_count"
                    label={adm.visits.ipVisitCount}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="username"
                    label={adm.visits.username}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="country"
                    label={adm.visits.country}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="url_path"
                    label={adm.visits.url}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="event_type"
                    label={adm.visits.eventType}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="event_detail"
                    label={adm.visits.eventDetail}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="locale"
                    label={adm.visits.locale}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="created_at"
                    label={adm.visits.time}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                  <AdminVisitSortTh
                    field="updated_at"
                    label={adm.visits.updatedAt}
                    sort={visitSort}
                    onSort={handleVisitSort}
                  />
                </tr>
              </thead>
              <tbody>
                {visits.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td className="admin-cell-ip">
                      <AdminIpCopyButton
                        ip={row.ip}
                        locale={locale}
                        onCopied={setCopyToast}
                      />
                    </td>
                    <td>{row.ip_visit_count ?? "—"}</td>
                    <td>{visitLogUsernameDisplay(row.username, locale)}</td>
                    <td>{geoLocationDisplay(row, locale)}</td>
                    <td className="admin-cell-wrap">{row.url_path}</td>
                    <td>{row.event_type}</td>
                    <td className="admin-cell-wrap">{row.event_detail ?? "—"}</td>
                    <td>{row.locale ?? "—"}</td>
                    <td>{formatBeijingDateTime(row.created_at)}</td>
                    <td>
                      {formatBeijingDateTime(row.updated_at ?? row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

            <nav className="admin-pagination" aria-label={adm.visits.heading}>
              <p className="admin-pagination-summary">
                {tf(adm.visits.pagination.summary, {
                  page: visitPage,
                  totalPages: visitTotalPages,
                  total: visitTotal,
                })}
              </p>
              <div className="admin-pagination-actions">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => void loadVisits(visitPage - 1, visitSort, visitUsernameFilter)}
                  disabled={loadingVisits || visitPage <= 1}
                >
                  {adm.visits.pagination.prev}
                </button>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => void loadVisits(visitPage + 1, visitSort, visitUsernameFilter)}
                  disabled={loadingVisits || visitPage >= visitTotalPages}
                >
                  {adm.visits.pagination.next}
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </section>

      <section className="section etr-panel">
        <div className="etr-history-head">
          <h2>{adm.feedback.heading}</h2>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={() => void loadFeedback()}
            disabled={loadingFeedback}
          >
            {adm.feedback.refresh}
          </button>
        </div>

        {feedback.length === 0 ? (
          <p className="hint">{adm.feedback.empty}</p>
        ) : (
          <>
            <div className="admin-cards">
              {feedback.map((row) => (
                <article key={row.id} className="strategy-card admin-card">
                  <h3 className="strategy-card-title">
                    #{row.id}
                    <span className="admin-card-meta">{row.email}</span>
                  </h3>
                  <dl className="strategy-card-grid">
                    <AdminCardField label={adm.feedback.content} value={row.content} wide />
                    <AdminCardField
                      label={adm.feedback.ip}
                      value={
                        <AdminIpCopyButton
                          ip={row.ip}
                          locale={locale}
                          onCopied={setCopyToast}
                        />
                      }
                    />
                    <AdminCardField
                      label={adm.feedback.country}
                      value={geoLocationDisplay(row, locale)}
                    />
                    <AdminCardField label={adm.feedback.locale} value={row.locale ?? "—"} />
                    <AdminCardField
                      label={adm.feedback.url}
                      value={row.url_path ?? "—"}
                      wide
                    />
                    <AdminCardField
                      label={adm.feedback.time}
                      value={formatBeijingDateTime(row.created_at)}
                      wide
                    />
                  </dl>
                </article>
              ))}
            </div>

            <div className="admin-table-wrap">
            <table className="compare-table etr-table admin-table">
              <thead>
                <tr>
                  <th>{adm.feedback.id}</th>
                  <th>{adm.feedback.email}</th>
                  <th>{adm.feedback.content}</th>
                  <th>{adm.feedback.ip}</th>
                  <th>{adm.feedback.country}</th>
                  <th>{adm.feedback.url}</th>
                  <th>{adm.feedback.locale}</th>
                  <th>{adm.feedback.time}</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.email}</td>
                    <td className="etr-remark-cell admin-cell-wrap">{row.content}</td>
                    <td className="admin-cell-ip">
                      <AdminIpCopyButton
                        ip={row.ip}
                        locale={locale}
                        onCopied={setCopyToast}
                      />
                    </td>
                    <td>{geoLocationDisplay(row, locale)}</td>
                    <td className="admin-cell-wrap">{row.url_path ?? "—"}</td>
                    <td>{row.locale ?? "—"}</td>
                    <td>{formatBeijingDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
