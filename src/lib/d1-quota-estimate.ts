/**
 * 按路由估算 D1 rows_read 负担（启发式；CF 无精确 per-route API）。
 * 乘数来自词表规模（~800 jp + ~150 en）与 list_missing / shared 等路径的实测量级。
 */

import { D1_FREE_ROW_READ_LIMIT } from "@/lib/d1-quota";

export type D1QuotaReadBurdenRow = {
  route_key: string;
  hit_count: number;
  est_rows_per_hit: number;
  est_total_rows: number;
  est_pct_of_limit: number;
  category: string;
};

export type D1QuotaReadBurdenSummary = {
  estimated_total_rows: number;
  estimated_pct_of_limit: number;
  rows: D1QuotaReadBurdenRow[];
  disclaimer: string;
};

type RouteHit = { route_key: string; hit_count: number };

function categoryForRoute(routeKey: string): string {
  if (routeKey.includes("/fill-schedule-gate")) return "fill_gate";
  if (routeKey.includes("/fill-")) return "fill_list_missing";
  if (routeKey.includes("/board-docx")) return "lesson_blob";
  if (routeKey.includes("/shared")) return "study_shared";
  if (routeKey.includes("/sync")) return "vocab_sync";
  if (routeKey.includes("/download-all")) return "vocab_export";
  if (routeKey.includes("/teacher-quiz-live")) return "quiz_live";
  if (routeKey.startsWith("/api/")) return "api_other";
  return "page_other";
}

/** 每类路由「每次 HTTP」粗算读行数（含业务 SQL + 流量统计 upsert + 鉴权） */
function estRowsPerHit(routeKey: string, category: string): number {
  switch (category) {
    case "fill_gate":
      return 80;
    case "fill_list_missing":
      // 全表/缺项扫 + na-adj 规范化 + 3 路流量 upsert
      if (routeKey.includes("/fill-usage")) return 1_800;
      if (routeKey.includes("/fill-example-sentences")) return 1_400;
      return 1_200;
    case "lesson_blob":
      return 4_500;
    case "study_shared":
      return 350;
    case "vocab_sync":
      return 500;
    case "vocab_export":
      return 2_500;
    case "quiz_live":
      return 120;
    default:
      return routeKey.startsWith("/api/") ? 90 : 25;
  }
}

export function buildD1ReadBurdenEstimate(
  routes: RouteHit[],
  rowReadLimit = D1_FREE_ROW_READ_LIMIT
): D1QuotaReadBurdenSummary {
  const rows: D1QuotaReadBurdenRow[] = [];
  let estimated_total_rows = 0;

  for (const row of routes) {
    const hit_count = Math.max(0, Number(row.hit_count) || 0);
    if (hit_count <= 0) continue;
    const route_key = String(row.route_key || "/");
    const category = categoryForRoute(route_key);
    const est_rows_per_hit = estRowsPerHit(route_key, category);
    const est_total_rows = hit_count * est_rows_per_hit;
    estimated_total_rows += est_total_rows;
    rows.push({
      route_key,
      hit_count,
      est_rows_per_hit,
      est_total_rows,
      est_pct_of_limit: 0,
      category,
    });
  }

  rows.sort((a, b) => b.est_total_rows - a.est_total_rows);
  const limit = Math.max(1, rowReadLimit);
  for (const row of rows) {
    row.est_pct_of_limit =
      Math.round((row.est_total_rows / limit) * 1000) / 10;
  }

  const top = rows.slice(0, 25);
  const topSum = top.reduce((a, b) => a + b.est_total_rows, 0);
  // 未进 Top25 的路由按 api 默认乘数粗算余量
  const remainderHits = routes
    .filter((r) => !top.some((t) => t.route_key === r.route_key))
    .reduce((a, b) => a + Math.max(0, Number(b.hit_count) || 0), 0);
  estimated_total_rows = topSum + remainderHits * 90;

  return {
    estimated_total_rows,
    estimated_pct_of_limit:
      Math.min(100, Math.round((estimated_total_rows / limit) * 1000) / 10),
    rows: top,
    disclaimer:
      "启发式估算（HTTP 次数 × 路由乘数），非 Cloudflare 官方 rows_read；用于对比 fill / shared / 板书 谁最重。",
  };
}
