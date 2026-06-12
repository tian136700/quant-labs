"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { strategyLabel } from "@/i18n/messages";
import { chgClass, fmtMoney, fmtPct } from "@/lib/compare";
import type { ComparePayload } from "@/lib/types";

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

  return (
    <>
      <p className="hint">
        {results.symbol}: <strong>{symbol}</strong> · {results.range}:{" "}
        <strong>
          {start} → {end}
        </strong>{" "}
        ({yearsLabel}) · {results.currentPriceOn}{" "}
        <strong>{current_date}</strong>: ${fmtMoney(current_price)} USD
      </p>
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
          {strategies.map((it) => {
            const deltaTxt =
              it.key === "dca"
                ? results.baseline
                : it.delta_pct == null
                  ? "—"
                  : `${it.delta_pct >= 0 ? "+" : ""}${it.delta_pct.toFixed(2)}%`;

            return (
              <tr key={it.key}>
                <td>{strategyLabel(locale, it.key, it.name)}</td>
                <td>{it.buy_days || "0"}</td>
                <td>{it.shares || "0"}</td>
                <td>{fmtMoney(it.avg_cost)}</td>
                <td>{fmtMoney(current_price)}</td>
                <td className={chgClass(it.per_pct)}>{fmtPct(it.per_pct)}</td>
                <td className={chgClass(it.delta_pct)}>{deltaTxt}</td>
                <td className={chgClass(it.total_pnl)}>
                  {it.total_pnl == null
                    ? "—"
                    : `${it.total_pnl >= 0 ? "+" : ""}${fmtMoney(it.total_pnl)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
