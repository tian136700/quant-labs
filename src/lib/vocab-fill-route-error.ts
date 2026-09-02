import { observeD1QuotaError } from "@/lib/d1-quota-observe";
import { jsonResponse } from "@/lib/cloudflare-env";

/** fill 路由 catch：记录 D1 配额错误并返回 500 JSON */
export function vocabFillRouteErrorResponse(request: Request, err: unknown) {
  observeD1QuotaError(request, err);
  const message = err instanceof Error ? err.message : String(err);
  return jsonResponse({ ok: false, error: message }, 500);
}
