import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildComparePayload, prepareRowsWithRsi } from "@/lib/compare";
import { getBarsWithCache, getLatestBarDate } from "@/lib/db";
import { addYears, todayIso, warmupStartForRsi } from "@/lib/rsi";
import type { BarsApiResponse, CloudflareEnv } from "@/lib/types";

export const runtime = "edge";

const MAX_YEARS = 10;

/**
 * GET /api/bars?symbol=SPY&years=5
 * 与原系统 /api/bars + compare.js 流程一致：
 * 1. 查 D1 缓存  2. 未命中则 Yahoo 抓取并写入  3. 计算 RSI + 策略对比
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    const yearsRaw = parseInt(url.searchParams.get("years") || "2", 10);

    if (!symbol || !/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) {
      return json({ ok: false, error: "Invalid ticker symbol" }, 400);
    }
    if (!Number.isFinite(yearsRaw) || yearsRaw < 1 || yearsRaw > MAX_YEARS) {
      return json(
        { ok: false, error: `Years must be between 1 and ${MAX_YEARS}` },
        400
      );
    }

    const env = await getEnv();
    const rsiPeriod = parseInt(env.RSI_PERIOD || "6", 10);
    const decimals = parseInt(env.PRICE_DECIMAL_PLACES || "3", 10);

    let endDate = (await getLatestBarDate(env.DB, symbol)) || todayIso();
    if (endDate > todayIso()) endDate = todayIso();

    const startDate = addYears(endDate, yearsRaw);
    const warmStart = warmupStartForRsi(startDate, rsiPeriod);

    const { rows: barsAsc, cacheHit } = await getBarsWithCache(
      env.DB,
      symbol,
      warmStart,
      endDate
    );

    if (!barsAsc.length) {
      return json(
        {
          ok: false,
          error: `No daily bars for ${symbol}. Check the ticker or try again later.`,
        },
        404
      );
    }

    const rowsWithRsi = prepareRowsWithRsi(barsAsc, rsiPeriod, decimals);
    const compare = buildComparePayload(
      symbol,
      rowsWithRsi,
      startDate,
      endDate,
      yearsRaw,
      rsiPeriod,
      decimals
    );

    const body: BarsApiResponse & { compare: typeof compare } = {
      ok: true,
      symbol,
      rsi_period: rsiPeriod,
      start: startDate,
      end: endDate,
      years: yearsRaw,
      cache_hit: cacheHit,
      rows: rowsWithRsi.filter(
        (r) => r.bar_date >= startDate && r.bar_date <= endDate
      ),
      compare,
    };

    return json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, 500);
  }
}

async function getEnv(): Promise<CloudflareEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cfEnv = env as CloudflareEnv;
    if (cfEnv?.DB) return cfEnv;
  } catch {
    /* 本地 next dev 无 Cloudflare 绑定时走 mock */
  }
  return getDevEnv();
}

/** 本地开发 fallback（无 D1 时仍可从 Yahoo 拉取） */
function getDevEnv(): CloudflareEnv {
  const mockDb = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] as never[] }),
        first: async () => null,
        run: async () => ({}),
      }),
    }),
    batch: async () => [],
  } as unknown as D1Database;

  return {
    DB: mockDb,
    RSI_PERIOD: "6",
    PRICE_DECIMAL_PLACES: "3",
  };
}

function json(data: BarsApiResponse | Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
