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

export function AdminWorkerTrafficCharts({
  hourly,
  dailyTrend,
  labels,
}: Props) {
  const layout = useChartLayout();

  const hourlyData = useMemo(
    () =>
      (hourly.length === 24 ? hourly : Array.from({ length: 24 }, (_, hour) => {
        const found = hourly.find((row) => row.hour === hour);
        return { hour, hit_count: found?.hit_count ?? 0 };
      })).map((row) => ({
        hour: row.hour,
        label: formatHourLabel(row.hour),
        hits: row.hit_count,
      })),
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
  const dailyHasData = dailyData.some((row) => row.hits > 0);

  return (
    <div className="admin-traffic-charts">
      <div className="admin-traffic-chart-block">
        <h3>{labels.hourlyHeading}</h3>
        <p className="hint admin-traffic-chart-hint">{labels.hourlyHint}</p>
        {hourlyHasData ? (
          <div className="admin-traffic-chart-frame" style={{ height: layout.height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={hourlyData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: layout.tickFontSize }}
                  minTickGap={layout.minTickGap}
                />
                <YAxis
                  width={layout.yAxisWidth}
                  tick={{ fontSize: layout.tickFontSize }}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [
                    Number(value).toLocaleString(),
                    labels.hits,
                  ]}
                  labelFormatter={(label) => `${labels.hourLabel} ${label}`}
                />
                <Legend />
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
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="hint">{labels.hourlyHint}</p>
        )}
      </div>

      <div className="admin-traffic-chart-block">
        <h3>{labels.dailyTrendHeading}</h3>
        {dailyHasData ? (
          <div className="admin-traffic-chart-frame" style={{ height: layout.height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailyData}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: layout.tickFontSize }}
                  minTickGap={layout.minTickGap}
                />
                <YAxis
                  width={layout.yAxisWidth}
                  tick={{ fontSize: layout.tickFontSize }}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [
                    Number(value).toLocaleString(),
                    labels.hits,
                  ]}
                  labelFormatter={(label, payload) => {
                    const full = payload?.[0]?.payload?.date as string | undefined;
                    return `${labels.dateShort} ${full || label}`;
                  }}
                />
                <Legend />
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
        ) : (
          <p className="hint">{labels.hourlyHint}</p>
        )}
      </div>
    </div>
  );
}
