import type { D1QuotaDiagnosticSummary } from "@/lib/d1-quota-db";
import { d1QuotaSignalLabel } from "@/lib/d1-quota";

export type D1QuotaReportLabels = {
  reportTitle: string;
  riskLevel: string;
  riskOk: string;
  riskWarn: string;
  riskCritical: string;
  quotaDate: string;
  probeStatus: string;
  probeOk: string;
  probeReadLimited: string;
  probeWriteLimited: string;
  probeError: string;
  readLimit: string;
  writeLimit: string;
  signalsHeading: string;
  guardrailsHeading: string;
  route: string;
  signal: string;
  hits: string;
  lastMessage: string;
  updatedAt: string;
};

function riskLabel(
  level: D1QuotaDiagnosticSummary["risk_level"],
  labels: D1QuotaReportLabels
): string {
  if (level === "critical") return labels.riskCritical;
  if (level === "warn") return labels.riskWarn;
  return labels.riskOk;
}

function probeLabel(
  status: D1QuotaDiagnosticSummary["probe_status"],
  labels: D1QuotaReportLabels
): string {
  if (status === "ok") return labels.probeOk;
  if (status === "row_read_limited") return labels.probeReadLimited;
  if (status === "row_write_limited") return labels.probeWriteLimited;
  return labels.probeError;
}

/** 生成可贴到 Bark / 聊天的 D1 配额诊断纯文本 */
export function formatD1QuotaDiagnosticReport(
  summary: D1QuotaDiagnosticSummary,
  labels: D1QuotaReportLabels
): string {
  const lines: string[] = [
    labels.reportTitle,
    `${labels.riskLevel}: ${riskLabel(summary.risk_level, labels)}`,
    `${labels.quotaDate}: ${summary.quota_stat_date}`,
    `${labels.probeStatus}: ${probeLabel(summary.probe_status, labels)}`,
    `probe_at: ${summary.probe_at}`,
    summary.probe_message ? `probe: ${summary.probe_message}` : "",
    `${labels.readLimit}: ${summary.total_read_limit_hits} hits (limit ${summary.row_read_limit.toLocaleString()}/day)`,
    `${labels.writeLimit}: ${summary.total_write_limit_hits} hits (limit ${summary.row_write_limit.toLocaleString()}/day)`,
    `generated_at: ${summary.generated_at}`,
    "",
    ...summary.risk_notes.map((n) => `- ${n}`),
    "",
    labels.signalsHeading,
  ];

  if (!summary.signals.length) {
    lines.push("(empty)");
  } else {
    for (const row of summary.signals) {
      lines.push(
        `${row.route_key}\t${d1QuotaSignalLabel(row.signal)}\t${row.hit_count}\t${row.last_message || "-"}`
      );
    }
  }

  lines.push("", labels.guardrailsHeading);
  for (const g of summary.guardrails) {
    lines.push(`${g.ok ? "✓" : "✗"} ${g.id}: ${g.detail}`);
  }

  return lines.filter((l) => l !== "").join("\n");
}
