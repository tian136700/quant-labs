import {
  getCloudflareEnv,
  jsonResponse,
} from "@/lib/cloudflare-env";
import { listPublicStoreReviews } from "@/store-review/db";
import type { StoreReviewSortField } from "@/store-review/types";

const SORT_FIELDS = new Set<StoreReviewSortField>([
  "store_name",
  "platform",
  "score",
  "updated_at",
]);

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const url = new URL(request.url);
    const sortRaw = url.searchParams.get("sort") || "updated_at";
    const orderRaw = url.searchParams.get("order") || "desc";
    const limitRaw = parseInt(url.searchParams.get("limit") || "200", 10);
    const platform = url.searchParams.get("platform");
    const store = url.searchParams.get("store");

    const sort = SORT_FIELDS.has(sortRaw as StoreReviewSortField)
      ? (sortRaw as StoreReviewSortField)
      : "updated_at";
    const order = orderRaw === "asc" ? "asc" : "desc";

    const data = await listPublicStoreReviews(env.DB, {
      platform,
      storeQuery: store,
      sortField: sort,
      sortOrder: order,
      limit: Number.isFinite(limitRaw) ? limitRaw : 200,
    });

    return jsonResponse({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message, data: [] }, 500);
  }
}
