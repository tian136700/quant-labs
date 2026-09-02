"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { useI18n } from "@/i18n/I18nProvider";
import type { D1QuotaDiagnosticSummary } from "@/lib/d1-quota-db";
import { d1QuotaSignalLabel } from "@/lib/d1-quota";
import { formatD1QuotaDiagnosticReport } from "@/lib/d1-quota-report";
import { copyTextToClipboard } from "@/lib/copy-text";
import { adminWorkerTrafficPath, adminWorker1102Path } from "@/lib/locale-path";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function riskClass(level: D1QuotaDiagnosticSummary["risk_level"]): string {
  if (level === "critical") return "admin-traffic-quota-fill--critical";
  if (level === "warn") return "admin-traffic-quota-fill--warn";
  return "";
}

export function AdminD1QuotaPanel() {
  const { locale, t } = useI18n();
  const labels = t("adminD1Quota").panel;
  const admTraffic = t("adminWorkerTraffic");
  const adm1102 = t("adminWorker1102");
  const [statDate, setStatDate] = useState(() => workerQuotaDateString());
  const [summary, setSummary] = useState<D1QuotaDiagnosticSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const load = useCallback(
    async (date = statDate) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ date });
        const res = await fetch(`/api/analytics/d1-quota?${params}`, {
          credentials: "include",
        });
        const data = (await res.json()) as D1QuotaDiagnosticSummary & {
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
    },
    [labels.loadFailed, statDate]
  );

  useEffect(() => {
    void load(statDate);
  }, [load, statDate]);

  const handleCopyReport = () => {
    if (!summary) return;
    const text = formatD1QuotaDiagnosticReport(summary, {
      reportTitle: labels.reportTitle,
      riskLevel: labels.riskLevel,
      riskOk: labels.riskOk,
      riskWarn: labels.riskWarn,
      riskCritical: labels.riskCritical,
      quotaDate: labels.quotaDate,
      probeStatus: labels.probeStatus,
      probeOk: labels.probeOk,
      probeReadLimited: labels.probeReadLimited,
      probeWriteLimited: labels.probeWriteLimited,
      probeError: labels.probeError,
      readLimit: labels.readLimit,
      writeLimit: labels.writeLimit,
      signalsHeading: labels.signalsHeading,
      guardrailsHeading: labels.guardrailsHeading,
      route: labels.route,
      signal: labels.signal,
      hits: labels.hits,
      lastMessage: labels.lastMessage,
      updatedAt: labels.updatedAt,
    });
    void copyTextToClipboard(text).then((ok) =>
      setCopyToast(ok ? labels.copySuccess : labels.copyFailed)
    );
  };

  const riskText =
    summary?.risk_level === "critical"
      ? labels.riskCritical
      : summary?.risk_level === "warn"
        ? labels.riskWarn
        : labels.riskOk;

  const probeText = (() => {
    if (!summary) return "";
    if (summary.probe_status === "ok") return labels.probeOk;
    if (summary.probe_status === "row_read_limited") return labels.probeReadLimited;
    if (summary.probe_status === "row_write_limited") return labels.probeWriteLimited;
    return labels.probeError;
  })();

  return (
    <section className="section etr-panel admin-traffic-panel">
      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />
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
            onClick={() => void load(statDate)}
            disabled={loading}
          >
            {loading ? labels.refreshing : labels.refresh}
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={handleCopyReport}
            disabled={loading || !summary}
          >
            {labels.copyReport}
          </button>
        </div>
      </div>

      <p className="hint admin-traffic-hint">{labels.diagnoseHint}</p>
      <p className="hint admin-traffic-hint">
        <Link href={adminWorkerTrafficPath(locale)}>
          {labels.workerTrafficLink.replace("{title}", admTraffic.page.title)}
        </Link>
        {" · "}
        <Link href={adminWorker1102Path(locale)}>
          {labels.worker1102Link.replace("{title}", adm1102.page.title)}
        </Link>
      </p>

      {error ? (
        <p className="telegram-push-result telegram-push-result--err">{error}</p>
      ) : null}

      {summary ? (
        <>
          <div className="admin-traffic-quota">
            <div className="admin-traffic-quota-head">
              <span>{labels.riskLevel}</span>
              <strong className={riskClass(summary.risk_level)}>{riskText}</strong>
            </div>
            <p className="admin-traffic-anon">
              {labels.probeStatus}: {probeText}
              {summary.probe_message ? ` — ${summary.probe_message}` : ""}
            </p>
            <p className="admin-traffic-rate">
              {labels.readLimit}: {formatNumber(summary.total_read_limit_hits)}{" "}
              {labels.hitsUnit} / {formatNumber(summary.row_read_limit)}{" "}
              {labels.perDay}
              {" · "}
              {labels.writeLimit}: {formatNumber(summary.total_write_limit_hits)}{" "}
              {labels.hitsUnit} / {formatNumber(summary.row_write_limit)}{" "}
              {labels.perDay}
            </p>
          </div>

          <div className="admin-traffic-block">
            <h3>{labels.riskNotesHeading}</h3>
            <ul className="admin-1102-notes">
              {summary.risk_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>

          <div className="admin-traffic-block">
            <h3>{labels.signalsHeading}</h3>
            {summary.signals.length === 0 ? (
              <p className="hint">{labels.signalsEmpty}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="compare-table etr-table admin-table">
                  <thead>
                    <tr>
                      <th>{labels.route}</th>
                      <th>{labels.signal}</th>
                      <th>{labels.hits}</th>
                      <th>{labels.lastMessage}</th>
                      <th>{labels.updatedAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.signals.map((row) => (
                      <tr key={`${row.route_key}:${row.signal}`}>
                        <td className="admin-cell-wrap">{row.route_key}</td>
                        <td>{d1QuotaSignalLabel(row.signal)}</td>
                        <td>{formatNumber(row.hit_count)}</td>
                        <td className="admin-cell-wrap">
                          {row.last_message || "—"}
                        </td>
                        <td>{row.updated_at || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-traffic-block">
            <h3>{labels.guardrailsHeading}</h3>
            <div className="admin-table-wrap">
              <table className="compare-table etr-table admin-table">
                <thead>
                  <tr>
                    <th>{labels.guardrailId}</th>
                    <th>{labels.guardrailOk}</th>
                    <th>{labels.guardrailDetail}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.guardrails.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.ok ? "✓" : "✗"}</td>
                      <td className="admin-cell-wrap">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
