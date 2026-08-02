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
  fillContention: string;
  failureLane: string;
  laneHtml: string;
  laneShared: string;
  laneFill: string;
  laneVocab: string;
  laneOther: string;
  guardrailsHeading: string;
  clientAggHeading: string;
  clientSamplesHeading: string;
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
  const laneLabel = (lane: string): string => {
    if (lane === "html_document") return labels.laneHtml;
    if (lane === "shared_api") return labels.laneShared;
    if (lane === "fill_api") return labels.laneFill;
    if (lane === "vocab_api") return labels.laneVocab;
    return labels.laneOther;
  };

  const lines: string[] = [
    `${labels.reportTitle}`,
    `${labels.riskLevel}: ${riskLabel(summary.risk_level, labels)}`,
    `${labels.shareDate}: ${summary.share_date}`,
    `${labels.quotaDate}: ${summary.quota_stat_date}`,
    `${labels.fillContention}: ${formatNumber(summary.fill_contention_hits ?? 0)}`,
    `generated_at: ${summary.generated_at}`,
    "",
    ...summary.risk_notes.map((n) => `- ${n}`),
    "",
    `${labels.clientSamplesHeading}:`,
  ];

  if (!summary.client_event_samples?.length) {
    lines.push("(no samples)");
  } else {
    summary.client_event_samples.slice(0, 25).forEach((row, i) => {
      lines.push(
        `${i + 1}. ${row.created_at}  ${row.event_kind}  lane=${laneLabel(row.failure_lane)}  page=${row.page_path}  failed=${row.failed_url || "-"}  status=${row.http_status ?? "-"}  ms=${row.duration_ms ?? "-"}  ray=${row.cf_ray || "-"}  user=${row.username || "-"}  detail=${row.detail_json || "{}"}`
      );
    });
  }

  lines.push("", `${labels.clientAggHeading}:`);
  if (!summary.client_event_agg?.length) {
    lines.push("(no client events yet)");
  } else {
    summary.client_event_agg.forEach((row, i) => {
      lines.push(
        `${i + 1}. ${row.event_kind}  ${row.page_path}  hits=${formatNumber(row.hit_count)}`
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

  lines.push("", `${labels.subjectsHeading}:`);
  for (const s of summary.subjects) {
    const name = s.subject === "jp" ? "jp" : "en";
    lines.push(
      `${name}: words=${formatNumber(s.word_count)} shared_today=${formatNumber(s.today_shared_count)} shared_sum_list=${formatNumber(s.today_shared_sum_list_bytes)}B shared_max_list=${formatNumber(s.today_shared_max_list_bytes)}B notes=${formatNumber(s.notes_count)} max_notes=${formatNumber(s.max_notes_bytes)}B avg_notes=${formatNumber(s.avg_notes_bytes)}B img_hints=${formatNumber(s.notes_with_image_hint)} shared_max_notes=${formatNumber(s.today_shared_max_notes_bytes)}B`
    );
  }

  lines.push("", `${labels.heaviestHeading}:`);
  if (!summary.heaviest_notes.length) {
    lines.push("(none — notes secondary; EN often empty)");
  } else {
    summary.heaviest_notes.forEach((row, i) => {
      lines.push(
        `${i + 1}. [${row.subject}] #${row.id} ${row.word}  ${formatNumber(row.notes_bytes)}B  ${row.has_image_hint ? labels.withImage : labels.noImage}`
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
