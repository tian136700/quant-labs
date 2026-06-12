/**
 * Wilder RSI（与原系统 lib/utils.py compute_rsi 一致）
 * 输入按时间升序的收盘价数组，返回同长度 RSI 序列（前 period 根为 null）
 */
export function computeRsi(closes: number[], period = 6): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period || period <= 0) return out;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i]! - closes[i - 1]!;
    avgGain += diff > 0 ? diff : 0;
    avgLoss += diff < 0 ? -diff : 0;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out[period] = 100 - 100 / (1 + rs0);

  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i]! - closes[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }

  return out;
}

/** 为 K 线附加 rsi 字段（默认返回新→旧，与原 attach_rsi_to_bar_rows 一致） */
export function attachRsiToBars(
  rowsAsc: { bar_date: string; close: number }[],
  period: number,
  decimals: number
): { bar_date: string; close: number; rsi: number | null }[] {
  const closes = rowsAsc.map((r) => r.close);
  const rsiSeries = computeRsi(closes, period);
  const merged = rowsAsc.map((r, i) => ({
    bar_date: r.bar_date,
    close: roundNum(r.close, decimals),
    rsi: rsiSeries[i] == null ? null : roundNum(rsiSeries[i]!, decimals),
  }));
  return merged.reverse();
}

export function roundNum(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** RSI 预热：与原 app warmup_start_for_rsi 一致 */
export function warmupStartForRsi(startIso: string, rsiPeriod: number): string {
  const start = new Date(`${startIso}T12:00:00Z`);
  const backDays = Math.max(45, rsiPeriod * 8);
  start.setUTCDate(start.getUTCDate() - backDays);
  return start.toISOString().slice(0, 10);
}

export function addYears(endIso: string, years: number): string {
  const end = new Date(`${endIso}T12:00:00Z`);
  end.setUTCFullYear(end.getUTCFullYear() - years);
  return end.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
