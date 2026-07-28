import type { WorkerTrafficDailySummary } from "@/lib/worker-traffic-db";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function quotaPercent(total: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((total / limit) * 1000) / 10);
}

export type WorkerTrafficReportLabels = {
  reportTitle: string;
  quotaUsed: string;
  anonymousLabel: string;
  topRoutes: string;
  topUsers: string;
  topPairs: string;
  kindApi: string;
  kindPage: string;
  anonymousUser: string;
};

/** 生成可贴到 Bark / 聊天的 1027 诊断纯文本 */
export function formatWorkerTrafficDiagnosticReport(
  summary: WorkerTrafficDailySummary,
  labels: WorkerTrafficReportLabels
): string {
  const percent = quotaPercent(summary.total_hits, summary.quota_limit);
  const kindLabel = (kind: string) =>
    kind === "api" ? labels.kindApi : labels.kindPage;
  const userLabel = (username: string) =>
    username.trim() ? username : labels.anonymousUser;

  const lines: string[] = [
    `${labels.reportTitle} ${summary.stat_date}`,
    labels.quotaUsed
      .replace("{used}", formatNumber(summary.total_hits))
      .replace("{limit}", formatNumber(summary.quota_limit))
      .replace("{percent}", String(percent)),
    `${labels.anonymousLabel}: ${formatNumber(summary.anonymous_hits)}`,
    "",
    `${labels.topRoutes}:`,
  ];

  summary.top_routes.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.route_key}  ${kindLabel(row.kind)}  ${formatNumber(row.hit_count)}`
    );
  });

  lines.push("", `${labels.topUsers}:`);
  if (summary.top_users.length === 0) {
    lines.push(`(${labels.anonymousUser})`);
  } else {
    summary.top_users.forEach((row, i) => {
      lines.push(
        `${i + 1}. ${row.username}  ${formatNumber(row.hit_count)}`
      );
    });
  }

  lines.push("", `${labels.topPairs}:`);
  summary.top_pairs.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${userLabel(row.username)}  ${row.route_key}  ${kindLabel(row.kind)}  ${formatNumber(row.hit_count)}`
    );
  });

  return lines.join("\n");
}
