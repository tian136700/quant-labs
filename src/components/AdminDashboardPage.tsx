"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { countryDisplayName } from "@/lib/geoip";
import { teacherReviewNavPath } from "@/lib/locale-path";
import type { UserFeedbackRecord, VisitLogRecord } from "@/lib/types";

const VISIT_PAGE_SIZE = 50;

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

export function AdminDashboardPage() {
  const { locale, t, tf } = useI18n();
  const adm = t("adminDashboard");
  const { isAdmin, checking } = useEtrAuth();

  const [visits, setVisits] = useState<VisitLogRecord[]>([]);
  const [visitPage, setVisitPage] = useState(1);
  const [visitTotal, setVisitTotal] = useState(0);
  const [visitTotalPages, setVisitTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<UserFeedbackRecord[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "err">("");

  const loadVisits = useCallback(async (page = 1) => {
    setLoadingVisits(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(VISIT_PAGE_SIZE),
      });
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
    } catch {
      setStatus(adm.status.loadFailed);
      setStatusKind("err");
    } finally {
      setLoadingVisits(false);
    }
  }, [adm.status.loadFailed]);

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
    await Promise.all([loadVisits(1), loadFeedback()]);
  }, [loadVisits, loadFeedback]);

  useEffect(() => {
    if (checking || !isAdmin) return;
    void loadAll();
  }, [checking, isAdmin, loadAll]);

  if (checking) {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="admin-page admin-page--auth">
        <div className="page-hero etr-hero-center">
          <h1>{adm.page.title}</h1>
          <p className="sub">{adm.auth.required}</p>
          <div className="etr-form-actions etr-form-actions--center">
            <a
              className="btn-rsi-filter btn-rsi-filter--primary"
              href={teacherReviewNavPath(locale)}
            >
              {adm.auth.login}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const statusClass =
    statusKind === "err" ? "telegram-push-result telegram-push-result--err" : "";

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{adm.page.title}</h1>
        <p className="sub">{adm.page.subtitle}</p>
      </div>

      {status ? <p className={statusClass}>{status}</p> : null}

      <section className="section etr-panel">
        <div className="etr-history-head">
          <h2>{adm.visits.heading}</h2>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={() => void loadVisits(visitPage)}
            disabled={loadingVisits}
          >
            {adm.visits.refresh}
          </button>
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
                    <AdminCardField label={adm.visits.ip} value={row.ip} />
                    <AdminCardField
                      label={adm.visits.ipVisitCount}
                      value={row.ip_visit_count ?? "—"}
                    />
                    <AdminCardField
                      label={adm.visits.country}
                      value={countryDisplayName(row.country_code, "zh")}
                    />
                    <AdminCardField label={adm.visits.eventType} value={row.event_type} />
                    <AdminCardField label={adm.visits.locale} value={row.locale ?? "—"} />
                    <AdminCardField label={adm.visits.url} value={row.url_path} wide />
                    <AdminCardField
                      label={adm.visits.eventDetail}
                      value={row.event_detail ?? "—"}
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
                  <th>{adm.visits.id}</th>
                  <th>{adm.visits.ip}</th>
                  <th>{adm.visits.ipVisitCount}</th>
                  <th>{adm.visits.country}</th>
                  <th>{adm.visits.url}</th>
                  <th>{adm.visits.eventType}</th>
                  <th>{adm.visits.eventDetail}</th>
                  <th>{adm.visits.locale}</th>
                  <th>{adm.visits.time}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.ip}</td>
                    <td>{row.ip_visit_count ?? "—"}</td>
                    <td>{countryDisplayName(row.country_code, "zh")}</td>
                    <td className="admin-cell-wrap">{row.url_path}</td>
                    <td>{row.event_type}</td>
                    <td className="admin-cell-wrap">{row.event_detail ?? "—"}</td>
                    <td>{row.locale ?? "—"}</td>
                    <td>{formatBeijingDateTime(row.created_at)}</td>
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
                  onClick={() => void loadVisits(visitPage - 1)}
                  disabled={loadingVisits || visitPage <= 1}
                >
                  {adm.visits.pagination.prev}
                </button>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => void loadVisits(visitPage + 1)}
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
                    <AdminCardField label={adm.feedback.ip} value={row.ip} />
                    <AdminCardField
                      label={adm.feedback.country}
                      value={countryDisplayName(row.country_code, "zh")}
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
                    <td>{row.ip}</td>
                    <td>{countryDisplayName(row.country_code, "zh")}</td>
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
