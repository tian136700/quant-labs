"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  WorkerTrafficDailyTrendPoint,
  WorkerTrafficHourlyPoint,
} from "@/lib/worker-traffic-db";
import { WORKER_QUOTA_HOUR_ORDER } from "@/lib/worker-traffic-rate";

type ChartLabels = {
  hourlyHeading: string;
  dailyTrendHeading: string;
  hourlyHint: string;
  hits: string;
  hourLabel: string;
  quotaResetLabel: string;
  dateShort: string;
};

type Props = {
  hourly: WorkerTrafficHourlyPoint[];
  dailyTrend: WorkerTrafficDailyTrendPoint[];
  labels: ChartLabels;
};

function useChartLayout() {
  const [layout, setLayout] = useState({
    yAxisWidth: 44,
    tickFontSize: 10,
    minTickGap: 28,
    height: 220,
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 480) {
        setLayout({
          yAxisWidth: 32,
          tickFontSize: 9,
          minTickGap: 36,
          height: 200,
        });
      } else if (w < 768) {
        setLayout({
          yAxisWidth: 36,
          tickFontSize: 10,
          minTickGap: 28,
          height: 220,
        });
      } else {
        setLayout({
          yAxisWidth: 48,
          tickFontSize: 11,
          minTickGap: 20,
          height: 260,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatDateTick(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : date;
}

/** 深色页上 Recharts 默认白底 tooltip 会继承浅色字 →「时刻」看不见；须显式定色 */
const TRAFFIC_CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1a2332",
    border: "1px solid #2d3a4d",
    borderRadius: 8,
    color: "#e7ecf3",
  },
  labelStyle: { color: "#e7ecf3", fontWeight: 600 },
  itemStyle: { color: "#c8d4e6" },
} as const;

const TRAFFIC_CHART_TICK = { fill: "#8b9cb3" } as const;
const TRAFFIC_CHART_GRID = "rgba(139, 156, 179, 0.28)";

export function AdminWorkerTrafficCharts({
  hourly,
  dailyTrend,
  labels,
}: Props) {
  const layout = useChartLayout();

  // 配额窗顺序：北京 08→23→次日 00→07（与 CF 日请求窗口一致）
  const hourlyData = useMemo(
    () =>
      WORKER_QUOTA_HOUR_ORDER.map((hour) => {
        const found = hourly.find((row) => row.hour === hour);
        return {
          hour,
          label: formatHourLabel(hour),
          hits: found?.hit_count ?? 0,
        };
      }),
    [hourly]
  );

  const dailyData = useMemo(
    () =>
      dailyTrend.map((row) => ({
        date: row.stat_date,
        label: formatDateTick(row.stat_date),
        hits: row.hit_count,
      })),
    [dailyTrend]
  );

  const hourlyHasData = hourlyData.some((row) => row.hits > 0);
  const tick = {
    ...TRAFFIC_CHART_TICK,
    fontSize: layout.tickFontSize,
  };

  return (
    <div className="admin-traffic-charts">
      <div className="admin-traffic-chart-block">
        <h3>{labels.hourlyHeading}</h3>
        <p className="hint admin-traffic-chart-hint">{labels.hourlyHint}</p>
        <div
          className="admin-traffic-chart-frame"
          style={{ height: layout.height }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={hourlyData}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={TRAFFIC_CHART_GRID}
              />
              <XAxis
                dataKey="label"
                tick={tick}
                minTickGap={layout.minTickGap}
              />
              <YAxis
                width={layout.yAxisWidth}
                tick={tick}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TRAFFIC_CHART_TOOLTIP_STYLE.contentStyle}
                labelStyle={TRAFFIC_CHART_TOOLTIP_STYLE.labelStyle}
                itemStyle={TRAFFIC_CHART_TOOLTIP_STYLE.itemStyle}
                formatter={(value) => [
                  Number(value).toLocaleString(),
                  labels.hits,
                ]}
                labelFormatter={(label) => `${labels.hourLabel} ${label}`}
              />
              <Legend wrapperStyle={{ color: "#8b9cb3", fontSize: 12 }} />
              <ReferenceLine
                x="08:00"
                stroke="#c45c26"
                strokeDasharray="4 4"
                label={{
                  value: labels.quotaResetLabel,
                  fill: "#c45c26",
                  fontSize: layout.tickFontSize,
                  position: "insideTopRight",
                }}
              />
              <Line
                type="monotone"
                dataKey="hits"
                name={labels.hits}
                stroke="#2f6fed"
                strokeWidth={2}
                dot={hourlyHasData ? false : { r: 2 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="admin-traffic-chart-block">
        <h3>{labels.dailyTrendHeading}</h3>
        <div
          className="admin-traffic-chart-frame"
          style={{ height: layout.height }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={
                dailyData.length > 0
                  ? dailyData
                  : [{ date: "", label: "—", hits: 0 }]
              }
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={TRAFFIC_CHART_GRID}
              />
              <XAxis
                dataKey="label"
                tick={tick}
                minTickGap={layout.minTickGap}
              />
              <YAxis
                width={layout.yAxisWidth}
                tick={tick}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TRAFFIC_CHART_TOOLTIP_STYLE.contentStyle}
                labelStyle={TRAFFIC_CHART_TOOLTIP_STYLE.labelStyle}
                itemStyle={TRAFFIC_CHART_TOOLTIP_STYLE.itemStyle}
                formatter={(value) => [
                  Number(value).toLocaleString(),
                  labels.hits,
                ]}
                labelFormatter={(label, payload) => {
                  const full = payload?.[0]?.payload?.date as
                    | string
                    | undefined;
                  return `${labels.dateShort} ${full || label}`;
                }}
              />
              <Legend wrapperStyle={{ color: "#8b9cb3", fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="hits"
                name={labels.hits}
                stroke="#1a9f6d"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
