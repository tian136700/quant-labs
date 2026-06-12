/**
 * 策略对比计算（与原 web/static/js/compare.js 口径一致）
 * - 定投：1 股均分到每个交易日
 * - RSI：1 股均分到 RSI 低于阈值的触发日
 * 图表：每日 $100 定投 vs 可选 RSI 阈值触发买入
 */
import type {
  BarRow,
  ChartPoint,
  ChartRsiThreshold,
  ComparePayload,
  StrategyResult,
} from "./types";
import { attachRsiToBars, roundNum } from "./rsi";

const THRESHOLDS = [20, 25, 30] as const;
const DAILY_INVEST = 100;

type RowWithRsi = BarRow & { rsi: number | null };

export function buildComparePayload(
  symbol: string,
  rowsNewestFirst: RowWithRsi[],
  start: string,
  end: string,
  years: number,
  rsiPeriod: number,
  decimals: number
): ComparePayload {
  const filtered = rowsNewestFirst.filter(
    (r) => r.bar_date >= start && r.bar_date <= end
  );
  const rowsAsc = [...filtered].reverse();

  const latest = pickLatestClose(filtered);
  if (!latest) {
    throw new Error("No valid closing prices in range");
  }

  const strategies: StrategyResult[] = [];

  const dcaRaw = calcStrategy(filtered, () => true);
  const dcaEnriched = enrichStrategy(dcaRaw, latest.price, null);
  strategies.push({
    key: "dca",
    name: "Daily DCA",
    rule: "Split 1 share across every trading day (close price)",
    ...dcaEnriched,
  });

  const dcaPerPct = dcaEnriched.per_pct;

  for (const thr of THRESHOLDS) {
    const sRaw = calcStrategy(
      filtered,
      (r) => r.rsi != null && !Number.isNaN(r.rsi) && r.rsi < thr
    );
    const sEnriched = enrichStrategy(sRaw, latest.price, null);
    const deltaPct =
      dcaPerPct != null && sEnriched.per_pct != null
        ? sEnriched.per_pct - dcaPerPct
        : null;
    strategies.push({
      key: `rsi_lt_${thr}`,
      name: `RSI < ${thr}`,
      rule: `Buy only when RSI(${rsiPeriod}) < ${thr}; 1 share split on trigger days`,
      ...sEnriched,
      delta_pct: deltaPct,
    });
  }

  const chart_points = buildChartSeries(rowsAsc);

  return {
    symbol: symbol.toUpperCase(),
    start,
    end,
    years,
    current_date: latest.bar_date,
    current_price: roundNum(latest.price, decimals),
    rsi_period: rsiPeriod,
    strategies,
    chart_points,
  };
}

/** 将升序 K 线附加 RSI 并转为新→旧 */
export function prepareRowsWithRsi(
  rowsAsc: BarRow[],
  rsiPeriod: number,
  decimals: number
): RowWithRsi[] {
  const withRsi = attachRsiToBars(
    rowsAsc.map((r) => ({ bar_date: r.bar_date, close: r.close })),
    rsiPeriod,
    decimals
  );
  const rsiMap = new Map(withRsi.map((r) => [r.bar_date, r.rsi]));
  return [...rowsAsc].reverse().map((r) => ({
    ...r,
    rsi: rsiMap.get(r.bar_date) ?? null,
  }));
}

function calcStrategy(
  rows: RowWithRsi[],
  predicate: (r: RowWithRsi) => boolean
) {
  let nDays = 0;
  let sum = 0;
  for (const r of rows) {
    if (!r.bar_date || r.close == null) continue;
    if (!predicate(r)) continue;
    nDays += 1;
    sum += r.close;
  }
  if (nDays === 0) {
    return { buy_days: 0, shares: 0, total_cost: 0, avg_cost: null, per_pct: null };
  }
  const avg = sum / nDays;
  return {
    buy_days: nDays,
    shares: 1,
    total_cost: avg,
    avg_cost: avg,
    per_pct: null as number | null,
  };
}

function enrichStrategy(
  base: ReturnType<typeof calcStrategy>,
  currentPrice: number,
  deltaPct: number | null
): Omit<StrategyResult, "key" | "name" | "rule"> {
  const { buy_days, shares, total_cost, avg_cost } = base;
  if (avg_cost == null || shares <= 0) {
    return {
      buy_days,
      shares,
      total_cost,
      avg_cost,
      per_pct: null,
      delta_pct: null,
      total_pnl: null,
    };
  }
  const perPct = avg_cost !== 0 ? ((currentPrice - avg_cost) / avg_cost) * 100 : null;
  const totalPnl = currentPrice * shares - total_cost;
  return {
    buy_days,
    shares,
    total_cost,
    avg_cost,
    per_pct: perPct,
    delta_pct: deltaPct,
    total_pnl: totalPnl,
  };
}

function pickLatestClose(rows: RowWithRsi[]) {
  let best: RowWithRsi | null = null;
  for (const r of rows) {
    if (!r.bar_date || r.close == null) continue;
    if (!best || r.bar_date > best.bar_date) best = r;
  }
  if (!best) return null;
  return { bar_date: best.bar_date, price: best.close };
}

/**
 * 累计资产曲线：每日各投入 $100（资金流入相同）。
 * - 定投：每天 $100 全部买入股票
 * - RSI：每天同样有 $100 预算；仅触发日买入，其余日持有现金
 * 曲线 = 股票市值 + 现金，两条线总投入一致，便于对比。
 */
function buildChartSeries(rowsAsc: RowWithRsi[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  let dcaShares = 0;
  const rsiShares: Record<15 | 20 | 25 | 30, number> = {
    15: 0,
    20: 0,
    25: 0,
    30: 0,
  };
  const rsiCash: Record<15 | 20 | 25 | 30, number> = {
    15: 0,
    20: 0,
    25: 0,
    30: 0,
  };

  for (const r of rowsAsc) {
    dcaShares += DAILY_INVEST / r.close;

    for (const thr of [15, 20, 25, 30] as const) {
      const triggered =
        r.rsi != null && !Number.isNaN(r.rsi) && r.rsi < thr;
      if (triggered) {
        rsiShares[thr] += DAILY_INVEST / r.close;
      } else {
        rsiCash[thr] += DAILY_INVEST;
      }
    }

    points.push({
      date: r.bar_date,
      dca_value: roundNum(dcaShares * r.close, 2),
      rsi_15_value: roundNum(rsiShares[15] * r.close + rsiCash[15], 2),
      rsi_20_value: roundNum(rsiShares[20] * r.close + rsiCash[20], 2),
      rsi_25_value: roundNum(rsiShares[25] * r.close + rsiCash[25], 2),
      rsi_30_value: roundNum(rsiShares[30] * r.close + rsiCash[30], 2),
    });
  }

  return points;
}

export function rsiChartValueKey(thr: ChartRsiThreshold): keyof ChartPoint {
  return `rsi_${thr}_value` as keyof ChartPoint;
}

export function fmtMoney(x: number | null, dec = 3): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(dec);
}

export function fmtPct(x: number | null): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
}

export function chgClass(x: number | null): string {
  if (x == null || Number.isNaN(x) || Math.abs(x) < 1e-12) return "";
  return x > 0 ? "chg-up" : "chg-dn";
}
