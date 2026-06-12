"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { strategyLabel } from "@/i18n/messages";
import { chgClass, fmtMoney, fmtPct } from "@/lib/compare";
import type { ComparePayload, StrategyResult } from "@/lib/types";

interface Props {
  data: ComparePayload;
}

export function CompareTable({ data }: Props) {
  const { locale, t, tf } = useI18n();
  const results = t("results");
  const table = t("table");
  const { symbol, start, end, years, current_date, current_price, strategies } =
    data;

  const yearsLabel =
    years > 1
      ? tf(results.pastYears, { years })
      : tf(results.pastYear, { years });

  const dcaStrategy = strategies.find((s) => s.key === "dca");
  const bestRsi = strategies
    .filter((s) => s.key !== "dca" && s.total_pnl != null)
    .sort((a, b) => (b.total_pnl ?? 0) - (a.total_pnl ?? 0))[0];

  return (
    <>
      {/* 手机 / 平板：统计卡片 + 策略卡片 */}
      <div className="results-overview results-overview--mobile" aria-label={results.heading}>
        <div className="stat-card">
          <p className="stat-card-label">{results.symbol}</p>
          <p className="stat-card-value">{symbol}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">{results.currentPriceOn}</p>
          <p className="stat-card-value">${fmtMoney(current_price)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">{results.range}</p>
          <p className="stat-card-value stat-card-value--sm stat-card-value--range">
            <span className="stat-card-range-line">{start}</span>
            <span className="stat-card-range-line">→ {end}</span>
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">{yearsLabel}</p>
          <p className="stat-card-value stat-card-value--sm">
            {dcaStrategy ? `${dcaStrategy.buy_days} ${table.buyDays}` : "—"}
          </p>
        </div>
        {bestRsi ? (
          <div className="stat-card">
            <p className="stat-card-label">{table.totalPnl}</p>
            <p className={`stat-card-value ${chgClass(bestRsi.total_pnl)}`}>
              {bestRsi.total_pnl == null
                ? "—"
                : `${bestRsi.total_pnl >= 0 ? "+" : ""}$${fmtMoney(bestRsi.total_pnl)}`}
            </p>
          </div>
        ) : null}
      </div>

      {/* PC：一行摘要 + 完整表格（与最初版本一致） */}
      <p className="hint compare-summary-desktop">
        {results.symbol}: <strong>{symbol}</strong> · {results.range}:{" "}
        <strong>
          {start} → {end}
        </strong>{" "}
        ({yearsLabel}) · {results.currentPriceOn}{" "}
        <strong>{current_date}</strong>: ${fmtMoney(current_price)} USD
      </p>

      <div className="compare-cards">
        {strategies.map((it) => (
          <StrategyCard
            key={it.key}
            strategy={it}
            currentPrice={current_price}
            locale={locale}
            table={table}
            baselineLabel={results.baseline}
          />
        ))}
      </div>

      <div className="table-wrap compare-table-desktop">
        <table className="compare-table">
          <thead>
            <tr>
              <th>{table.strategy}</th>
              <th>{table.buyDays}</th>
              <th>{table.totalShares}</th>
              <th>{table.avgBuy}</th>
              <th>{table.currentPrice}</th>
              <th>{table.perShareReturn}</th>
              <th>{table.vsDca}</th>
              <th>{table.totalPnl}</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((it) => (
              <StrategyRow
                key={it.key}
                strategy={it}
                currentPrice={current_price}
                locale={locale}
                baselineLabel={results.baseline}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StrategyRow({
  strategy: it,
  currentPrice,
  locale,
  baselineLabel,
}: {
  strategy: StrategyResult;
  currentPrice: number;
  locale: "en" | "zh";
  baselineLabel: string;
}) {
  const deltaTxt = deltaLabel(it, baselineLabel);

  return (
    <tr>
      <td>{strategyLabel(locale, it.key, it.name)}</td>
      <td>{it.buy_days || "0"}</td>
      <td>{it.shares || "0"}</td>
      <td>{fmtMoney(it.avg_cost)}</td>
      <td>{fmtMoney(currentPrice)}</td>
      <td className={chgClass(it.per_pct)}>{fmtPct(it.per_pct)}</td>
      <td className={chgClass(it.delta_pct)}>{deltaTxt}</td>
      <td className={chgClass(it.total_pnl)}>
        {it.total_pnl == null
          ? "—"
          : `${it.total_pnl >= 0 ? "+" : ""}${fmtMoney(it.total_pnl)}`}
      </td>
    </tr>
  );
}

function StrategyCard({
  strategy: it,
  currentPrice,
  locale,
  table,
  baselineLabel,
}: {
  strategy: StrategyResult;
  currentPrice: number;
  locale: "en" | "zh";
  table: {
    buyDays: string;
    totalShares: string;
    avgBuy: string;
    currentPrice: string;
    perShareReturn: string;
    vsDca: string;
    totalPnl: string;
  };
  baselineLabel: string;
}) {
  const deltaTxt = deltaLabel(it, baselineLabel);
  const pnlTxt =
    it.total_pnl == null
      ? "—"
      : `${it.total_pnl >= 0 ? "+" : ""}${fmtMoney(it.total_pnl)}`;

  return (
    <article className="strategy-card">
      <h3 className="strategy-card-title">
        {strategyLabel(locale, it.key, it.name)}
      </h3>
      <dl className="strategy-card-grid">
        <CardItem label={table.buyDays} value={String(it.buy_days || "0")} />
        <CardItem label={table.totalShares} value={String(it.shares || "0")} />
        <CardItem label={table.avgBuy} value={`$${fmtMoney(it.avg_cost)}`} />
        <CardItem
          label={table.currentPrice}
          value={`$${fmtMoney(currentPrice)}`}
        />
        <CardItem
          label={table.perShareReturn}
          value={fmtPct(it.per_pct)}
          valueClass={chgClass(it.per_pct)}
        />
        <CardItem
          label={table.vsDca}
          value={deltaTxt}
          valueClass={chgClass(it.delta_pct)}
        />
        <CardItem
          label={table.totalPnl}
          value={pnlTxt}
          valueClass={chgClass(it.total_pnl)}
          wide
        />
      </dl>
    </article>
  );
}

function CardItem({
  label,
  value,
  valueClass = "",
  wide = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  wide?: boolean;
}) {
  return (
    <div className={`strategy-card-item${wide ? " strategy-card-item--wide" : ""}`}>
      <dt>{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}

function deltaLabel(strategy: StrategyResult, baselineLabel: string): string {
  if (strategy.key === "dca") return baselineLabel;
  if (strategy.delta_pct == null) return "—";
  return `${strategy.delta_pct >= 0 ? "+" : ""}${strategy.delta_pct.toFixed(2)}%`;
}
