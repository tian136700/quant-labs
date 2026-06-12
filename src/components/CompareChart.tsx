"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { rsiChartValueKey } from "@/lib/compare";
import {
  CHART_RSI_THRESHOLDS,
  type ChartPoint,
  type ChartRsiThreshold,
} from "@/lib/types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LS_CHART_RSI = "strategy_compare_chart_rsi";

interface Props {
  points: ChartPoint[];
  symbol: string;
}

function readStoredRsi(): ChartRsiThreshold {
  if (typeof window === "undefined") return 30;
  try {
    const v = parseInt(localStorage.getItem(LS_CHART_RSI) || "30", 10);
    if (CHART_RSI_THRESHOLDS.includes(v as ChartRsiThreshold)) {
      return v as ChartRsiThreshold;
    }
  } catch {
    /* ignore */
  }
  return 30;
}

function useChartLayout() {
  const [layout, setLayout] = useState({ yAxisWidth: 44, tickFontSize: 10, minTickGap: 48 });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 480) {
        setLayout({ yAxisWidth: 36, tickFontSize: 9, minTickGap: 56 });
      } else if (w < 768) {
        setLayout({ yAxisWidth: 40, tickFontSize: 10, minTickGap: 48 });
      } else {
        setLayout({ yAxisWidth: 52, tickFontSize: 11, minTickGap: 40 });
      }
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

export function CompareChart({ points, symbol }: Props) {
  const { t, tf } = useI18n();
  const chart = t("chart");
  const [rsiThr, setRsiThr] = useState<ChartRsiThreshold>(30);
  const { yAxisWidth, tickFontSize, minTickGap } = useChartLayout();

  useEffect(() => {
    setRsiThr(readStoredRsi());
  }, []);

  const pickRsi = (thr: ChartRsiThreshold) => {
    setRsiThr(thr);
    try {
      localStorage.setItem(LS_CHART_RSI, String(thr));
    } catch {
      /* ignore */
    }
  };

  if (!points.length) {
    return <p className="empty">{chart.noData}</p>;
  }

  const sampled =
    points.length > 400
      ? points.filter((_, i) => i % Math.ceil(points.length / 400) === 0)
      : points;

  const rsiKey = rsiChartValueKey(rsiThr);
  const rsiLabel = tf(chart.rsiLt, { thr: rsiThr });

  return (
    <div className="chart-panel">
      <div className="chart-panel-head">
        <h3>{tf(chart.title, { symbol })}</h3>
        <div className="chart-rsi-picker">
          <span className="chart-rsi-picker-label">{chart.rsiThreshold}</span>
          <div
            className="chart-rsi-picker-btns"
            role="group"
            aria-label={chart.rsiThreshold}
          >
            {CHART_RSI_THRESHOLDS.map((thr) => (
              <button
                key={thr}
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact${
                  rsiThr === thr ? " is-active" : ""
                }`}
                aria-pressed={rsiThr === thr}
                onClick={() => pickRsi(thr)}
              >
                &lt; {thr}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sampled}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#8b9cb3", fontSize: tickFontSize }}
              tickMargin={6}
              minTickGap={minTickGap}
            />
            <YAxis
              tick={{ fill: "#8b9cb3", fontSize: tickFontSize }}
              tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
              width={yAxisWidth}
            />
            <Tooltip
              contentStyle={{
                background: "#1a2332",
                border: "1px solid #2d3a4d",
                borderRadius: 8,
                color: "#e7ecf3",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
              labelFormatter={(label) => `${chart.date}: ${label}`}
            />
            <Legend wrapperStyle={{ color: "#8b9cb3", fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="dca_value"
              name={chart.dailyDca}
              stroke="#3d8bfd"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={rsiKey}
              name={rsiLabel}
              stroke="#3fb983"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        {chart.hint}
      </p>
    </div>
  );
}
