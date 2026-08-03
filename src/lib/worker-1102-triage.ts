/**
 * 1102 看板：失败车道分类 + 样本去噪（浏览器与服务端共用，勿引 D1）。
 */

import type { Worker1102ClientEventKind } from "@/lib/worker-1102-client-shared";

export type Worker1102FailureLane =
  | "html_document"
  | "shared_api"
  | "fill_api"
  | "vocab_api"
  | "auth_api"
  | "other";

const EVENT_RANK: Record<Worker1102ClientEventKind, number> = {
  cf_1102_html: 0,
  shared_fail: 1,
  api_5xx: 2,
  fetch_network: 3,
  page_ok: 4,
};

/** 把失败 URL / 事件归到诊断车道，方便区分「整页 HTML」vs「shared」vs「fill 争用」 */
export function classifyWorker1102FailureLane(input: {
  eventKind: Worker1102ClientEventKind | string;
  pagePath?: string;
  failedUrl?: string;
}): Worker1102FailureLane {
  const kind = input.eventKind;
  const page = (input.pagePath || "").split("?")[0] || "";
  const failed = (input.failedUrl || "").toLowerCase();
  const pathOnly = failed.replace(/^https?:\/\/[^/]+/i, "");

  if (
    pathOnly.includes("/english-teacher-review/auth") ||
    pathOnly.includes("/api/auth") ||
    failed.includes("teacher-review/auth")
  ) {
    return "auth_api";
  }

  if (kind === "cf_1102_html") {
    // fetch 拿到 CF 1102 HTML：看失败 URL 是文档还是 API
    if (
      !pathOnly ||
      pathOnly === "/" ||
      /\/(jp-vocab|en-vocab|ko-pron)\/study\/?$/.test(pathOnly) ||
      (!pathOnly.includes("/api/") && !failed.includes("/api/"))
    ) {
      return "html_document";
    }
  }

  if (
    kind === "shared_fail" ||
    pathOnly.includes("/shared") ||
    failed.includes("/shared")
  ) {
    return "shared_api";
  }

  if (/\/fill-/.test(pathOnly) || /\/fill-/.test(failed)) {
    return "fill_api";
  }

  if (
    /\/api\/(jp-vocab|en-vocab|ko-pron)/.test(pathOnly) ||
    /\/api\/(jp-vocab|en-vocab|ko-pron)/.test(failed)
  ) {
    return "vocab_api";
  }

  if (
    /\/(jp-vocab|en-vocab|ko-pron)\/study/.test(page) &&
    (kind === "fetch_network" || kind === "api_5xx")
  ) {
    // study 页上的网络失败：多数是进页后的 shared；仍标 shared 方便对照硬刷新
    return pathOnly.includes("/api/") || failed.includes("/api/")
      ? "shared_api"
      : "html_document";
  }

  return "other";
}

export function worker1102FailureLaneLabelZh(lane: Worker1102FailureLane): string {
  switch (lane) {
    case "html_document":
      return "整页HTML";
    case "shared_api":
      return "shared接口";
    case "fill_api":
      return "fill补全";
    case "vocab_api":
      return "词表API";
    case "auth_api":
      return "鉴权API";
    default:
      return "其它";
  }
}

/** 看板样本：失败优先；page_ok 最多保留几条（证明软导航成功，硬 1102 不会出现） */
export function prioritizeWorker1102ClientSamples<
  T extends {
    event_kind: Worker1102ClientEventKind | string;
    created_at: string;
  },
>(rows: T[], opts?: { maxPageOk?: number; limit?: number }): T[] {
  const maxPageOk = opts?.maxPageOk ?? 3;
  const limit = opts?.limit ?? 25;
  const failures = rows.filter((r) => r.event_kind !== "page_ok");
  const pageOk = rows
    .filter((r) => r.event_kind === "page_ok")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, maxPageOk);

  return [...failures, ...pageOk]
    .sort((a, b) => {
      const ra =
        EVENT_RANK[a.event_kind as Worker1102ClientEventKind] ?? 9;
      const rb =
        EVENT_RANK[b.event_kind as Worker1102ClientEventKind] ?? 9;
      if (ra !== rb) return ra - rb;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, limit);
}

export function isWorker1102FillRoute(routeKey: string): boolean {
  return /\/api\/(jp|en)-vocab\/fill-/.test(routeKey);
}

export function isWorker1102RelatedTrafficRoute(routeKey: string): boolean {
  if (isWorker1102FillRoute(routeKey)) return true;
  if (routeKey === "/") return true;
  const needles = [
    "/api/jp-vocab/shared",
    "/api/en-vocab/shared",
    "/api/jp-vocab/class-notes",
    "/api/en-vocab/class-notes",
    "/api/jp-vocab/sync",
    "/api/en-vocab/sync",
    "/api/jp-vocab/teacher-quiz-live",
    "/api/en-vocab/teacher-quiz-live",
    "/jp-vocab/study",
    "/en-vocab/study",
    "/ko-pron/study",
    "/api/jp-vocab",
    "/api/en-vocab",
    "/api/ko-pron",
  ];
  return needles.some(
    (n) => routeKey === n || routeKey.startsWith(`${n}/`) || routeKey.startsWith(n)
  );
}
