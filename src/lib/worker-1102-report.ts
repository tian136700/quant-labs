import type { Worker1102DiagnosticSummary } from "@/lib/worker-1102-db";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export type Worker1102ReportLabels = {
  reportTitle: string;
  riskLevel: string;
  riskOk: string;
  riskWarn: string;
  riskCritical: string;
  shareDate: string;
  quotaDate: string;
  subjectsHeading: string;
  heaviestHeading: string;
  heavySignalsHeading: string;
  relatedTrafficHeading: string;
  guardrailsHeading: string;
  signalSlow: string;
  signalLarge: string;
  signalHttp5xx: string;
  withImage: string;
  noImage: string;
  trafficQuota: string;
};

function riskLabel(
  level: Worker1102DiagnosticSummary["risk_level"],
  labels: Worker1102ReportLabels
): string {
  if (level === "critical") return labels.riskCritical;
  if (level === "warn") return labels.riskWarn;
  return labels.riskOk;
}

function signalLabel(
  signal: string,
  labels: Worker1102ReportLabels
): string {
  if (signal === "slow") return labels.signalSlow;
  if (signal === "large") return labels.signalLarge;
  if (signal === "http5xx") return labels.signalHttp5xx;
  return signal;
}

/** 生成可贴到 Bark / 聊天的 1102 诊断纯文本 */
export function formatWorker1102DiagnosticReport(
  summary: Worker1102DiagnosticSummary,
  labels: Worker1102ReportLabels
): string {
  const lines: string[] = [
    `${labels.reportTitle}`,
    `${labels.riskLevel}: ${riskLabel(summary.risk_level, labels)}`,
    `${labels.shareDate}: ${summary.share_date}`,
    `${labels.quotaDate}: ${summary.quota_stat_date}`,
    `generated_at: ${summary.generated_at}`,
    "",
    ...summary.risk_notes.map((n) => `- ${n}`),
    "",
    `${labels.subjectsHeading}:`,
  ];

  for (const s of summary.subjects) {
    const name = s.subject === "jp" ? "jp" : "en";
    lines.push(
      `${name}: words=${formatNumber(s.word_count)} notes=${formatNumber(s.notes_count)} max_notes=${formatNumber(s.max_notes_bytes)}B avg_notes=${formatNumber(s.avg_notes_bytes)}B img_hints=${formatNumber(s.notes_with_image_hint)} shared_today=${formatNumber(s.today_shared_count)} shared_sum_list=${formatNumber(s.today_shared_sum_list_bytes)}B shared_max_list=${formatNumber(s.today_shared_max_list_bytes)}B shared_max_notes=${formatNumber(s.today_shared_max_notes_bytes)}B`
    );
  }

  lines.push("", `${labels.heaviestHeading}:`);
  if (!summary.heaviest_notes.length) {
    lines.push("(none)");
  } else {
    summary.heaviest_notes.forEach((row, i) => {
      lines.push(
        `${i + 1}. [${row.subject}] #${row.id} ${row.word}  ${formatNumber(row.notes_bytes)}B  ${row.has_image_hint ? labels.withImage : labels.noImage}`
      );
    });
  }

  lines.push("", `${labels.heavySignalsHeading}:`);
  if (!summary.heavy_signals.length) {
    lines.push("(none yet — only slow/large/5xx on instrumented hot paths)");
  } else {
    summary.heavy_signals.forEach((row, i) => {
      lines.push(
        `${i + 1}. ${row.route_key}  ${signalLabel(row.signal, labels)}  hits=${formatNumber(row.hit_count)}  max_ms=${formatNumber(row.max_duration_ms)}  max_bytes=${formatNumber(row.max_bytes)}`
      );
    });
  }

  lines.push(
    "",
    `${labels.relatedTrafficHeading}:`,
    labels.trafficQuota
      .replace("{used}", formatNumber(summary.traffic_total_hits))
      .replace("{limit}", formatNumber(summary.traffic_quota_limit))
  );
  if (!summary.related_traffic_routes.length) {
    lines.push("(no related routes in traffic top yet)");
  } else {
    summary.related_traffic_routes.forEach((row, i) => {
      lines.push(
        `${i + 1}. ${row.route_key}  ${row.kind}  ${formatNumber(row.hit_count)}`
      );
    });
  }

  lines.push("", `${labels.guardrailsHeading}:`);
  for (const g of summary.guardrails) {
    lines.push(`${g.ok ? "[ok]" : "[!!]"} ${g.id}: ${g.detail}`);
  }

  return lines.join("\n");
}
