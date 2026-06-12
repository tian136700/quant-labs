import type { BarRow } from "./types";

/** 轻量 Yahoo Finance Chart API（Edge 友好，单次 HTTP） */
export async function fetchYahooDailyBars(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<BarRow[]> {
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 =
    Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000) + 86400;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; StrategyCompare/1.0)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance HTTP ${res.status}`);
  }

  const json = (await res.json()) as YahooChartResponse;
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(`No data for ${symbol}`);
  }

  const quote = result.indicators?.quote?.[0];
  if (!quote?.close) {
    throw new Error(`Invalid quote payload for ${symbol}`);
  }

  const rows: BarRow[] = [];
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const close = quote.close[i];
    if (close == null || Number.isNaN(close)) continue;
    const ts = result.timestamp[i]!;
    const barDate = new Date(ts * 1000).toISOString().slice(0, 10);
    rows.push({
      bar_date: barDate,
      open: numOrNull(quote.open?.[i]),
      high: numOrNull(quote.high?.[i]),
      low: numOrNull(quote.low?.[i]),
      close,
      volume: numOrNull(quote.volume?.[i]),
    });
  }

  rows.sort((a, b) => a.bar_date.localeCompare(b.bar_date));
  return rows;
}

function numOrNull(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}
