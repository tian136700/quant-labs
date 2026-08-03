"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { useI18n } from "@/i18n/I18nProvider";
import { copyTextToClipboard } from "@/lib/copy-text";
import type { Worker1102DiagnosticSummary } from "@/lib/worker-1102-db";
import { formatWorker1102DiagnosticReport } from "@/lib/worker-1102-report";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function riskClass(level: Worker1102DiagnosticSummary["risk_level"]): string {
  if (level === "critical") return "admin-traffic-quota-fill--critical";
  if (level === "warn") return "admin-traffic-quota-fill--warn";
  return "";
}

function EmptyTableRow({ message }: { message: string }) {
  return (
    <div className="admin-visits-table-wrap">
      <table className="admin-visits-table admin-1102-text-table">
        <tbody>
          <tr>
            <td className="muted admin-1102-text-cell">{message}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AdminWorker1102Panel() {
  const { t } = useI18n();
  const labels = t("adminWorker1102").panel;
  const [statDate, setStatDate] = useState(() => workerQuotaDateString());
  const [summary, setSummary] = useState<Worker1102DiagnosticSummary | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const load = useCallback(
    async (date = statDate) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ date });
        const res = await fetch(`/api/analytics/worker-1102?${params}`, {
          credentials: "include",
        });
        const data = (await res.json()) as Worker1102DiagnosticSummary & {
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
    const text = formatWorker1102DiagnosticReport(summary, {
      reportTitle: labels.reportTitle,
      riskLevel: labels.riskLevel,
      riskOk: labels.riskOk,
      riskWarn: labels.riskWarn,
      riskCritical: labels.riskCritical,
      shareDate: labels.shareDate,
      quotaDate: labels.quotaDate,
      subjectsHeading: labels.subjectsHeading,
      heaviestHeading: labels.heaviestHeading,
      heavySignalsHeading: labels.heavySignalsHeading,
      relatedTrafficHeading: labels.relatedTrafficHeading,
      fillContention: labels.fillContention,
      failureLane: labels.failureLane,
      laneHtml: labels.laneHtml,
      laneShared: labels.laneShared,
      laneFill: labels.laneFill,
      laneVocab: labels.laneVocab,
      laneAuth: labels.laneAuth,
      laneOther: labels.laneOther,
      guardrailsHeading: labels.guardrailsHeading,
      clientAggHeading: labels.clientAggHeading,
      clientSamplesHeading: labels.clientSamplesHeading,
      signalSlow: labels.signalSlow,
      signalLarge: labels.signalLarge,
      signalHttp5xx: labels.signalHttp5xx,
      withImage: labels.withImage,
      noImage: labels.noImage,
      trafficQuota: labels.trafficQuota,
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

  const guideRows = [
    { item: labels.guideWhat, detail: labels.guideWhatDetail },
    { item: labels.guidePriority, detail: labels.guidePriorityDetail },
    { item: labels.guideTriage, detail: labels.guideTriageDetail },
    { item: labels.guideNotes, detail: labels.guideNotesDetail },
    { item: labels.guideHardReload, detail: labels.guideHardReloadDetail },
  ];

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

      <p className="hint admin-traffic-diagnose-hint">{labels.diagnoseHint}</p>

      <h3 className="admin-traffic-subhead">{labels.guideHeading}</h3>
      <div className="admin-visits-table-wrap">
        <table className="admin-visits-table admin-1102-text-table">
          <thead>
            <tr>
              <th>{labels.colItem}</th>
              <th>{labels.colDetail}</th>
            </tr>
          </thead>
          <tbody>
            {guideRows.map((row) => (
              <tr key={row.item}>
                <td className="admin-1102-item-cell">{row.item}</td>
                <td className="admin-1102-text-cell">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {summary ? (
        <>
          <div className="admin-traffic-quota">
            <div className="admin-traffic-quota-head">
              {labels.riskLevel}: <strong>{riskText}</strong>
            </div>
            <div className="admin-traffic-quota-track" aria-hidden>
              <div
                className={`admin-traffic-quota-fill ${riskClass(summary.risk_level)}`}
                style={{
                  width:
                    summary.risk_level === "critical"
                      ? "100%"
                      : summary.risk_level === "warn"
                        ? "60%"
                        : "25%",
                }}
              />
            </div>
          </div>

          <div className="admin-visits-table-wrap">
            <table className="admin-visits-table admin-1102-text-table">
              <thead>
                <tr>
                  <th>{labels.colItem}</th>
                  <th>{labels.colDetail}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{labels.riskLevel}</td>
                  <td>{riskText}</td>
                </tr>
                <tr>
                  <td>{labels.shareDate}</td>
                  <td>{summary.share_date}</td>
                </tr>
                <tr>
                  <td>{labels.quotaDate}</td>
                  <td>{summary.quota_stat_date}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="admin-traffic-subhead">{labels.riskNotesHeading}</h3>
          <div className="admin-visits-table-wrap">
            <table className="admin-visits-table admin-1102-text-table">
              <thead>
                <tr>
                  <th>{labels.colIndex}</th>
                  <th>{labels.colDetail}</th>
                </tr>
              </thead>
              <tbody>
                {summary.risk_notes.map((note, index) => (
                  <tr key={`${index}-${note.slice(0, 24)}`}>
                    <td>{index + 1}</td>
                    <td className="admin-1102-text-cell">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="admin-traffic-subhead">{labels.clientSamplesHeading}</h3>
          <p className="hint admin-traffic-diagnose-hint">
            {labels.clientSamplesHint}
          </p>
          {(summary.client_event_samples ?? []).length === 0 ? (
            <EmptyTableRow message={labels.emptyClient} />
          ) : (
            <div className="admin-visits-table-wrap">
              <table className="admin-visits-table">
                <thead>
                  <tr>
                    <th>{labels.time}</th>
                    <th>{labels.eventKind}</th>
                    <th>{labels.failureLane}</th>
                    <th>{labels.failReason}</th>
                    <th>{labels.host}</th>
                    <th>{labels.pagePath}</th>
                    <th>{labels.failedUrl}</th>
                    <th>{labels.httpStatus}</th>
                    <th>{labels.maxMs}</th>
                    <th>{labels.cfRay}</th>
                    <th>{labels.username}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.client_event_samples.map((row) => (
                    <tr key={row.id}>
                      <td>{row.created_at.replace("T", " ").slice(0, 19)}</td>
                      <td>{row.event_kind}</td>
                      <td>
                        {row.failure_lane === "html_document"
                          ? labels.laneHtml
                          : row.failure_lane === "shared_api"
                            ? labels.laneShared
                            : row.failure_lane === "fill_api"
                              ? labels.laneFill
                              : row.failure_lane === "vocab_api"
                                ? labels.laneVocab
                                : row.failure_lane === "auth_api"
                                  ? labels.laneAuth
                                  : labels.laneOther}
                      </td>
                      <td>{row.fail_reason || "—"}</td>
                      <td>{row.host || "—"}</td>
                      <td>{row.page_path}</td>
                      <td className="admin-1102-url-cell">
                        {row.failed_url || "—"}
                      </td>
                      <td>{row.http_status ?? "—"}</td>
                      <td>{row.duration_ms ?? "—"}</td>
                      <td>{row.cf_ray || "—"}</td>
                      <td>{row.username || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-traffic-subhead">{labels.clientAggHeading}</h3>
          {(summary.client_event_agg ?? []).length === 0 ? (
            <EmptyTableRow message={labels.emptyClient} />
          ) : (
            <div className="admin-visits-table-wrap">
              <table className="admin-visits-table">
                <thead>
                  <tr>
                    <th>{labels.eventKind}</th>
                    <th>{labels.pagePath}</th>
                    <th>{labels.hits}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.client_event_agg.map((row) => (
                    <tr key={`${row.event_kind}-${row.page_path}`}>
                      <td>{row.event_kind}</td>
                      <td>{row.page_path}</td>
                      <td>{formatNumber(row.hit_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-traffic-subhead">{labels.heavySignalsHeading}</h3>
          {summary.heavy_signals.length === 0 ? (
            <EmptyTableRow message={labels.emptySignals} />
          ) : (
            <div className="admin-visits-table-wrap">
              <table className="admin-visits-table">
                <thead>
                  <tr>
                    <th>{labels.route}</th>
                    <th>{labels.signal}</th>
                    <th>{labels.hits}</th>
                    <th>{labels.maxMs}</th>
                    <th>{labels.maxBytes}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.heavy_signals.map((row) => (
                    <tr key={`${row.route_key}-${row.signal}`}>
                      <td>{row.route_key}</td>
                      <td>
                        {row.signal === "slow"
                          ? labels.signalSlow
                          : row.signal === "large"
                            ? labels.signalLarge
                            : labels.signalHttp5xx}
                      </td>
                      <td>{formatNumber(row.hit_count)}</td>
                      <td>{formatNumber(row.max_duration_ms)}</td>
                      <td>{formatNumber(row.max_bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-traffic-subhead">{labels.subjectsHeading}</h3>
          <div className="admin-visits-table-wrap">
            <table className="admin-visits-table">
              <thead>
                <tr>
                  <th>{labels.subject}</th>
                  <th>{labels.wordCount}</th>
                  <th>{labels.sharedToday}</th>
                  <th>{labels.sharedSumList}</th>
                  <th>{labels.notesCount}</th>
                  <th>{labels.maxNotes}</th>
                  <th>{labels.avgNotes}</th>
                  <th>{labels.imgHints}</th>
                </tr>
              </thead>
              <tbody>
                {summary.subjects.map((row) => (
                  <tr key={row.subject}>
                    <td>
                      {row.subject === "jp"
                        ? labels.subjectJp
                        : labels.subjectEn}
                    </td>
                    <td>{formatNumber(row.word_count)}</td>
                    <td>{formatNumber(row.today_shared_count)}</td>
                    <td>{formatNumber(row.today_shared_sum_list_bytes)}</td>
                    <td>{formatNumber(row.notes_count)}</td>
                    <td>{formatNumber(row.max_notes_bytes)}</td>
                    <td>{formatNumber(row.avg_notes_bytes)}</td>
                    <td>{formatNumber(row.notes_with_image_hint)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="admin-traffic-subhead">{labels.heaviestHeading}</h3>
          {summary.heaviest_notes.length === 0 ? (
            <EmptyTableRow message={labels.emptyHeavy} />
          ) : (
            <div className="admin-visits-table-wrap">
              <table className="admin-visits-table">
                <thead>
                  <tr>
                    <th>{labels.subject}</th>
                    <th>ID</th>
                    <th>{labels.word}</th>
                    <th>{labels.maxNotes}</th>
                    <th>{labels.imageCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.heaviest_notes.map((row) => (
                    <tr key={`${row.subject}-${row.id}`}>
                      <td>
                        {row.subject === "jp"
                          ? labels.subjectJp
                          : labels.subjectEn}
                      </td>
                      <td>{row.id}</td>
                      <td>{row.word}</td>
                      <td>{formatNumber(row.notes_bytes)}</td>
                      <td>
                        {row.has_image_hint ? labels.withImage : labels.noImage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-traffic-subhead">{labels.relatedTrafficHeading}</h3>
          <div className="admin-visits-table-wrap">
            <table className="admin-visits-table admin-1102-text-table">
              <thead>
                <tr>
                  <th>{labels.colItem}</th>
                  <th>{labels.colDetail}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{labels.quotaDate}</td>
                  <td>
                    {labels.trafficQuota
                      .replace(
                        "{used}",
                        formatNumber(summary.traffic_total_hits)
                      )
                      .replace(
                        "{limit}",
                        formatNumber(summary.traffic_quota_limit)
                      )}
                  </td>
                </tr>
                <tr>
                  <td>{labels.fillContention}</td>
                  <td>{formatNumber(summary.fill_contention_hits ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {summary.related_traffic_routes.length === 0 ? (
            <EmptyTableRow message={labels.emptyTraffic} />
          ) : (
            <div className="admin-visits-table-wrap">
              <table className="admin-visits-table">
                <thead>
                  <tr>
                    <th>{labels.route}</th>
                    <th>{labels.kind}</th>
                    <th>{labels.hits}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.related_traffic_routes.map((row) => (
                    <tr key={row.route_key}>
                      <td>{row.route_key}</td>
                      <td>{row.kind}</td>
                      <td>{formatNumber(row.hit_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="admin-traffic-subhead">{labels.guardrailsHeading}</h3>
          <div className="admin-visits-table-wrap">
            <table className="admin-visits-table admin-1102-text-table">
              <thead>
                <tr>
                  <th>{labels.colStatus}</th>
                  <th>{labels.colItem}</th>
                  <th>{labels.colDetail}</th>
                </tr>
              </thead>
              <tbody>
                {summary.guardrails.map((g) => (
                  <tr key={g.id}>
                    <td>{g.ok ? labels.statusOk : labels.statusFail}</td>
                    <td className="admin-1102-item-cell">{g.id}</td>
                    <td className="admin-1102-text-cell">{g.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
