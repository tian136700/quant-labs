"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type {
  WorkerTrafficDailySummary,
  WorkerTrafficRouteRow,
  WorkerTrafficUserRow,
} from "@/lib/worker-traffic-db";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function quotaPercent(total: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((total / limit) * 1000) / 10);
}

export function AdminWorkerTrafficPanel() {
  const { t } = useI18n();
  const labels = t("adminDashboard").traffic;
  const [statDate, setStatDate] = useState(() => beijingDateString());
  const [summary, setSummary] = useState<WorkerTrafficDailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTraffic = useCallback(async (date = statDate) => {
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
    } catch {
      setError(labels.loadFailed);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed, statDate]);

  useEffect(() => {
    void loadTraffic(statDate);
  }, [loadTraffic, statDate]);

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
        </div>
      </div>

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
          </div>

          {summary.total_hits === 0 ? (
            <p className="hint">{labels.empty}</p>
          ) : (
            <div className="admin-traffic-grid">
              <div className="admin-traffic-block">
                <h3>{labels.topRoutes}</h3>
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
                          <td className="admin-cell-wrap">{row.route_key}</td>
                          <td>
                            {row.kind === "api" ? labels.kindApi : labels.kindPage}
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
                <div className="admin-table-wrap">
                  <table className="compare-table etr-table admin-table">
                    <thead>
                      <tr>
                        <th>{labels.username}</th>
                        <th>{labels.hits}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top_users.length === 0 ? (
                        <tr>
                          <td colSpan={2}>{labels.unregistered}</td>
                        </tr>
                      ) : (
                        summary.top_users.map((row: WorkerTrafficUserRow) => (
                          <tr key={row.username}>
                            <td>{row.username}</td>
                            <td>{formatNumber(row.hit_count)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
