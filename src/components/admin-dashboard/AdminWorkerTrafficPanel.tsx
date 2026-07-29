"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { AdminWorkerTrafficRouteIpModal } from "@/components/admin-dashboard/AdminWorkerTrafficRouteIpModal";
import { useI18n } from "@/i18n/I18nProvider";
import { copyTextToClipboard } from "@/lib/copy-text";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type {
  WorkerTrafficDailySummary,
  WorkerTrafficPairRow,
  WorkerTrafficRouteRow,
  WorkerTrafficUserRow,
} from "@/lib/worker-traffic-db";
import { formatWorkerTrafficDiagnosticReport } from "@/lib/worker-traffic-report";

const AdminWorkerTrafficCharts = dynamic(
  () =>
    import("@/components/admin-dashboard/AdminWorkerTrafficCharts").then(
      (m) => m.AdminWorkerTrafficCharts
    ),
  { ssr: false }
);

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function quotaPercent(total: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((total / limit) * 1000) / 10);
}

/** 空字符串 = 未登录筛选项 */
const FILTER_ANON = "__anon__";

export function AdminWorkerTrafficPanel() {
  const { t } = useI18n();
  const labels = t("adminDashboard").traffic;
  const [statDate, setStatDate] = useState(() => beijingDateString());
  const [summary, setSummary] = useState<WorkerTrafficDailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [ipRoute, setIpRoute] = useState<string | null>(null);

  const loadTraffic = useCallback(
    async (date = statDate) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ date });
        const res = await fetch(`/api/analytics/traffic?${params}`, {
          credentials: "include",
        });
        const data = (await res.json()) as WorkerTrafficDailySummary & {
          ok?: boolean;
          error?: string;
        };
        if (!data.ok) {
          setError(data.error || labels.loadFailed);
          setSummary(null);
          return;
        }
        setSummary(data);
        setUserFilter(null);
      } catch {
        setError(labels.loadFailed);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    [labels.loadFailed, statDate]
  );

  useEffect(() => {
    void loadTraffic(statDate);
  }, [loadTraffic, statDate]);

  const displayUsername = useCallback(
    (username: string) =>
      username.trim() ? username : labels.anonymousUser,
    [labels.anonymousUser]
  );

  const filteredPairs = useMemo(() => {
    const pairs = summary?.top_pairs ?? [];
    if (userFilter === null) return pairs;
    if (userFilter === FILTER_ANON) {
      return pairs.filter((row) => !row.username.trim());
    }
    return pairs.filter((row) => row.username === userFilter);
  }, [summary?.top_pairs, userFilter]);

  const handleCopyReport = () => {
    if (!summary) return;
    const text = formatWorkerTrafficDiagnosticReport(summary, {
      reportTitle: labels.reportTitle,
      quotaUsed: labels.quotaUsed,
      anonymousLabel: labels.anonymousLabel,
      topRoutes: labels.topRoutes,
      topUsers: labels.topUsers,
      topPairs: labels.topPairs,
      kindApi: labels.kindApi,
      kindPage: labels.kindPage,
      anonymousUser: labels.anonymousUser,
    });
    void copyTextToClipboard(text).then((ok) =>
      setCopyToast(ok ? labels.copySuccess : labels.copyFailed)
    );
  };

  const toggleUserFilter = (username: string) => {
    const key = username.trim() ? username : FILTER_ANON;
    setUserFilter((prev) => (prev === key ? null : key));
  };

  const percent = summary
    ? quotaPercent(summary.total_hits, summary.quota_limit)
    : 0;
  const quotaClass =
    percent >= 95
      ? "admin-traffic-quota-fill--critical"
      : percent >= 80
        ? "admin-traffic-quota-fill--warn"
        : "";

  return (
    <section className="section etr-panel admin-traffic-panel">
      <div className="etr-history-head admin-visits-head">
        <h2>{labels.heading}</h2>
        <div className="admin-visits-toolbar">
          <label className="admin-visits-filter">
            <span className="admin-visits-filter-label">{labels.dateLabel}</span>
            <input
              type="date"
              className="admin-traffic-date-input"
              value={statDate}
              onChange={(event) => setStatDate(event.target.value)}
              disabled={loading}
            />
          </label>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={() => void loadTraffic(statDate)}
            disabled={loading}
          >
            {labels.refresh}
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={handleCopyReport}
            disabled={loading || !summary || summary.total_hits === 0}
          >
            {labels.copyReport}
          </button>
        </div>
      </div>

      <p className="hint admin-traffic-hint">{labels.diagnoseHint}</p>

      {error ? (
        <p className="telegram-push-result telegram-push-result--err">{error}</p>
      ) : null}

      {summary ? (
        <>
          <div className="admin-traffic-quota">
            <div className="admin-traffic-quota-head">
              <span>{labels.quotaLabel}</span>
              <strong>
                {labels.quotaUsed
                  .replace("{used}", formatNumber(summary.total_hits))
                  .replace("{limit}", formatNumber(summary.quota_limit))
                  .replace("{percent}", String(percent))}
              </strong>
            </div>
            <div
              className="admin-traffic-quota-track"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`admin-traffic-quota-fill ${quotaClass}`.trim()}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="admin-traffic-anon">
              {labels.anonymousHits.replace(
                "{count}",
                formatNumber(summary.anonymous_hits)
              )}
            </p>
            <p className="admin-traffic-rate" aria-live="polite">
              {labels.avgPerSec
                .replace(
                  "{rate}",
                  String(summary.avg_hits_per_sec ?? 0)
                )
                .replace(
                  "{elapsed}",
                  formatNumber(summary.quota_elapsed_sec ?? 0)
                )}
              {summary.peak_hour != null
                ? ` · ${labels.peakPerSec
                    .replace("{hour}", String(summary.peak_hour).padStart(2, "0"))
                    .replace(
                      "{rate}",
                      String(summary.peak_hour_hits_per_sec ?? 0)
                    )}`
                : ""}
            </p>
          </div>

          <AdminWorkerTrafficCharts
            hourly={summary.hourly ?? []}
            dailyTrend={summary.daily_trend ?? []}
            labels={{
              hourlyHeading: labels.hourlyHeading,
              dailyTrendHeading: labels.dailyTrendHeading,
              hourlyHint: labels.hourlyHint,
              hits: labels.hits,
              hourLabel: labels.hourLabel,
              quotaResetLabel: labels.quotaResetLabel,
              dateShort: labels.dateShort,
            }}
          />

          {summary.total_hits === 0 ? (
            <p className="hint">{labels.empty}</p>
          ) : (
            <>
              <div className="admin-traffic-grid">
                <div className="admin-traffic-block">
                  <h3>{labels.topRoutes}</h3>
                  <p className="hint admin-traffic-filter-hint">
                    {labels.routeClickHint}
                  </p>
                  <div className="admin-table-wrap">
                    <table className="compare-table etr-table admin-table">
                      <thead>
                        <tr>
                          <th>{labels.route}</th>
                          <th>{labels.kind}</th>
                          <th>{labels.hits}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.top_routes.map((row: WorkerTrafficRouteRow) => (
                          <tr key={`${row.kind}:${row.route_key}`}>
                            <td className="admin-cell-wrap">
                              <button
                                type="button"
                                className="admin-traffic-user-btn"
                                onClick={() => setIpRoute(row.route_key)}
                              >
                                {row.route_key}
                              </button>
                            </td>
                            <td>
                              {row.kind === "api"
                                ? labels.kindApi
                                : labels.kindPage}
                            </td>
                            <td>{formatNumber(row.hit_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-traffic-block">
                  <h3>{labels.topUsers}</h3>
                  <p className="hint admin-traffic-filter-hint">
                    {labels.filterUserHint}
                  </p>
                  <div className="admin-table-wrap">
                    <table className="compare-table etr-table admin-table">
                      <thead>
                        <tr>
                          <th>{labels.username}</th>
                          <th>{labels.hits}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.anonymous_hits > 0 ? (
                          <tr
                            className={
                              userFilter === FILTER_ANON
                                ? "admin-traffic-row--active"
                                : undefined
                            }
                          >
                            <td>
                              <button
                                type="button"
                                className="admin-traffic-user-btn"
                                onClick={() => toggleUserFilter("")}
                              >
                                {labels.anonymousUser}
                              </button>
                            </td>
                            <td>{formatNumber(summary.anonymous_hits)}</td>
                          </tr>
                        ) : null}
                        {summary.top_users.length === 0 &&
                        summary.anonymous_hits === 0 ? (
                          <tr>
                            <td colSpan={2}>{labels.unregistered}</td>
                          </tr>
                        ) : (
                          summary.top_users.map((row: WorkerTrafficUserRow) => (
                            <tr
                              key={row.username}
                              className={
                                userFilter === row.username
                                  ? "admin-traffic-row--active"
                                  : undefined
                              }
                            >
                              <td>
                                <button
                                  type="button"
                                  className="admin-traffic-user-btn"
                                  onClick={() =>
                                    toggleUserFilter(row.username)
                                  }
                                >
                                  {row.username}
                                </button>
                              </td>
                              <td>{formatNumber(row.hit_count)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {userFilter !== null ? (
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact admin-traffic-clear-filter"
                      onClick={() => setUserFilter(null)}
                    >
                      {labels.filterUserAll}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="admin-traffic-block admin-traffic-block--pairs">
                <h3>
                  {labels.topPairs}
                  {userFilter !== null
                    ? ` · ${
                        userFilter === FILTER_ANON
                          ? labels.anonymousUser
                          : userFilter
                      }`
                    : ""}
                </h3>
                <div className="admin-table-wrap">
                  <table className="compare-table etr-table admin-table">
                    <thead>
                      <tr>
                        <th>{labels.username}</th>
                        <th>{labels.route}</th>
                        <th>{labels.kind}</th>
                        <th>{labels.hits}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPairs.length === 0 ? (
                        <tr>
                          <td colSpan={4}>{labels.empty}</td>
                        </tr>
                      ) : (
                        filteredPairs.map((row: WorkerTrafficPairRow) => (
                          <tr
                            key={`${row.username}\0${row.kind}\0${row.route_key}`}
                          >
                            <td>{displayUsername(row.username)}</td>
                            <td className="admin-cell-wrap">{row.route_key}</td>
                            <td>
                              {row.kind === "api"
                                ? labels.kindApi
                                : labels.kindPage}
                            </td>
                            <td>{formatNumber(row.hit_count)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      <AdminWorkerTrafficRouteIpModal
        open={ipRoute != null}
        statDate={statDate}
        routeKey={ipRoute || ""}
        labels={{
          routeIpsHeading: labels.routeIpsHeading,
          ip: labels.ip,
          hits: labels.hits,
          empty: labels.empty,
          loadFailed: labels.loadFailed,
          close: labels.close,
          routeIpsHint: labels.routeIpsHint,
        }}
        onClose={() => setIpRoute(null)}
      />

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
      />
    </section>
  );
}
