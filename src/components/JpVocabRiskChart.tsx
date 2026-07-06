"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildRiskChartData,
  countExcludedRiskRows,
  type JpVocabRiskRow,
} from "@/lib/jp-vocab-risk";
import { jpVocabPriorityLabel } from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";
import {
  Bar,
  BarChart,
  Label,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  words: JpVocabWord[];
};

/** Matplotlib 默认蓝（桌面端图表） */
const BAR_FILL = "#1f77b4";
const CHART_BG = "#ffffff";
const CHART_INK = "#000000";
const CHART_GRID = "#cccccc";

function useMobileRiskView() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function useChartLayout() {
  const [layout, setLayout] = useState({
    tickFontSize: 11,
    barSize: 22,
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 480) {
        setLayout({ tickFontSize: 9, barSize: 16 });
      } else if (w < 768) {
        setLayout({ tickFontSize: 10, barSize: 19 });
      } else {
        setLayout({ tickFontSize: 11, barSize: 22 });
      }
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

function riskBadgeTier(risk: number): "high" | "mid" | "low" {
  if (risk >= 3) return "high";
  if (risk >= 1) return "mid";
  return "low";
}

function riskAxisMax(maxRisk: number): number {
  const padded = Math.max(maxRisk, 0.5);
  return Math.ceil(padded * 2) / 2;
}

function riskAxisTicks(max: number): number[] {
  const ticks: number[] = [];
  for (let v = 0; v <= max + 0.001; v += 0.5) {
    ticks.push(Math.round(v * 10) / 10);
  }
  return ticks;
}

function measureYAxisWidth(names: string[], fontSize: number): number {
  if (!names.length) return 72;
  const padding = 14;

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${fontSize}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
      let max = 0;
      for (const name of names) {
        max = Math.max(max, ctx.measureText(name).width);
      }
      return Math.ceil(max) + padding;
    }
  }

  const maxLen = names.reduce((m, n) => Math.max(m, n.length), 0);
  return Math.ceil(maxLen * fontSize * 0.92) + padding;
}

function YAxisTick({
  x,
  y,
  payload,
  fontSize,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  fontSize: number;
}) {
  if (x == null || y == null || !payload) return null;
  return (
    <text
      x={x - 6}
      y={y}
      dy={4}
      textAnchor="end"
      fill={CHART_INK}
      fontSize={fontSize}
    >
      {payload.value}
    </text>
  );
}

function RiskTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: JpVocabRiskRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="jp-vocab-risk-tooltip">
      <p>
        <span className="jp-vocab-risk-tooltip-label">知识点：</span>
        {row.name}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">类型：</span>
        {row.kindLabel}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">非常熟悉：</span>
        {row.familiar}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">一般：</span>
        {row.normal}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">不熟悉：</span>
        {row.unknown}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">复习次数：</span>
        {row.reviewCount}
      </p>
      <p>
        <span className="jp-vocab-risk-tooltip-label">{jpVocabPriorityLabel()}：</span>
        {row.risk}
      </p>
    </div>
  );
}

function RiskMobileList({
  rows,
  xMax,
  excludedCount,
}: {
  rows: JpVocabRiskRow[];
  xMax: number;
  excludedCount: number;
}) {
  const priorityLabel = jpVocabPriorityLabel();

  return (
    <div className="jp-vocab-risk-mobile">
      <p className="jp-vocab-risk-mobile-title">知识点抽查优先级（越高越建议先问）</p>
      <ul className="jp-vocab-risk-mobile-list">
        {rows.map((row, idx) => {
          const barPct = xMax > 0 ? Math.min(100, (row.risk / xMax) * 100) : 0;
          const tier = riskBadgeTier(row.risk);
          return (
            <li key={row.id}>
              <details className="jp-vocab-risk-mobile-item">
                <summary className="jp-vocab-risk-mobile-summary">
                  <span className="jp-vocab-risk-mobile-rank">{idx + 1}</span>
                  <div className="jp-vocab-risk-mobile-main">
                    <div className="jp-vocab-risk-mobile-headrow">
                      <span className="jp-vocab-risk-mobile-name">{row.name}</span>
                      <span
                        className={`jp-vocab-risk-mobile-kind${
                          row.kind === "grammar" ? " jp-vocab-risk-mobile-kind--grammar" : ""
                        }`}
                      >
                        {row.kindLabel}
                      </span>
                      <span
                        className={`jp-vocab-risk-mobile-risk jp-vocab-risk-mobile-risk--${tier}`}
                        title={priorityLabel}
                      >
                        {row.risk.toFixed(1)}
                      </span>
                    </div>
                    <div
                      className="jp-vocab-risk-mobile-bar-track"
                      role="presentation"
                      aria-hidden="true"
                    >
                      <div
                        className={`jp-vocab-risk-mobile-bar-fill jp-vocab-risk-mobile-bar-fill--${tier}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <span className="jp-vocab-risk-mobile-chev" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="jp-vocab-risk-mobile-detail">
                  <div className="jp-vocab-risk-mobile-stat">
                    <span className="jp-vocab-risk-mobile-stat-label">非常熟悉</span>
                    <span className="jp-vocab-risk-mobile-stat-value chg-dn">{row.familiar}</span>
                  </div>
                  <div className="jp-vocab-risk-mobile-stat">
                    <span className="jp-vocab-risk-mobile-stat-label">一般</span>
                    <span className="jp-vocab-risk-mobile-stat-value">{row.normal}</span>
                  </div>
                  <div className="jp-vocab-risk-mobile-stat">
                    <span className="jp-vocab-risk-mobile-stat-label">不熟悉</span>
                    <span className="jp-vocab-risk-mobile-stat-value chg-up">{row.unknown}</span>
                  </div>
                  <div className="jp-vocab-risk-mobile-stat">
                    <span className="jp-vocab-risk-mobile-stat-label">复习次数</span>
                    <span className="jp-vocab-risk-mobile-stat-value">{row.reviewCount}</span>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {excludedCount > 0 ? (
        <p className="jp-vocab-risk-mobile-note">
          另有 {excludedCount} 个知识点抽查优先级为 0 或更低（未复习，或仅勾选「非常熟悉」），未列入上表。
        </p>
      ) : null}
      <style jsx>{`
        .jp-vocab-risk-mobile {
          width: 100%;
        }
        .jp-vocab-risk-mobile-title {
          margin: 0 0 0.625rem;
          font-size: clamp(0.8125rem, 3.2vw, 0.875rem);
          font-weight: 600;
          color: var(--text);
          line-height: 1.4;
        }
        .jp-vocab-risk-mobile-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .jp-vocab-risk-mobile-item {
          border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          border-radius: 14px;
          background: color-mix(in srgb, var(--panel) 94%, var(--bg));
          overflow: hidden;
        }
        .jp-vocab-risk-mobile-summary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 0.75rem;
          min-height: 2.75rem;
          cursor: pointer;
          list-style: none;
        }
        .jp-vocab-risk-mobile-summary::-webkit-details-marker {
          display: none;
        }
        .jp-vocab-risk-mobile-rank {
          flex: 0 0 auto;
          min-width: 1.375rem;
          font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-risk-mobile-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .jp-vocab-risk-mobile-headrow {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          min-width: 0;
        }
        .jp-vocab-risk-mobile-name {
          flex: 1;
          min-width: 0;
          font-size: clamp(0.875rem, 3.5vw, 0.9375rem);
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .jp-vocab-risk-mobile-kind {
          flex: 0 0 auto;
          font-size: clamp(0.625rem, 2.4vw, 0.6875rem);
          padding: 0.125rem 0.375rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          white-space: nowrap;
        }
        .jp-vocab-risk-mobile-kind--grammar {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        .jp-vocab-risk-mobile-risk {
          flex: 0 0 auto;
          font-size: clamp(0.6875rem, 2.6vw, 0.75rem);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          padding: 0.125rem 0.4375rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 88%, var(--bg));
        }
        .jp-vocab-risk-mobile-risk--low {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 30%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        .jp-vocab-risk-mobile-risk--mid {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }
        .jp-vocab-risk-mobile-risk--high {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 30%, var(--border));
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
        }
        .jp-vocab-risk-mobile-bar-track {
          width: 100%;
          height: 0.25rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 55%, transparent);
          overflow: hidden;
        }
        .jp-vocab-risk-mobile-bar-fill {
          height: 100%;
          border-radius: 999px;
          min-width: 2px;
          transition: width 0.2s ease;
        }
        .jp-vocab-risk-mobile-bar-fill--low {
          background: var(--fall);
        }
        .jp-vocab-risk-mobile-bar-fill--mid {
          background: var(--accent);
        }
        .jp-vocab-risk-mobile-bar-fill--high {
          background: var(--rise);
        }
        .jp-vocab-risk-mobile-chev {
          flex: 0 0 auto;
          font-size: 1rem;
          color: var(--muted);
          transition: transform 0.15s ease;
        }
        .jp-vocab-risk-mobile-item[open] .jp-vocab-risk-mobile-chev {
          transform: rotate(90deg);
        }
        .jp-vocab-risk-mobile-detail {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.375rem 0.75rem;
          padding: 0 0.75rem 0.625rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
          margin-top: -0.125rem;
          padding-top: 0.5rem;
        }
        .jp-vocab-risk-mobile-stat {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.375rem;
          min-height: 1.75rem;
        }
        .jp-vocab-risk-mobile-stat-label {
          font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
          color: var(--muted);
        }
        .jp-vocab-risk-mobile-stat-value {
          font-size: clamp(0.8125rem, 3vw, 0.875rem);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }
        .jp-vocab-risk-mobile-note {
          margin: 0.625rem 0 0;
          font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
          color: var(--muted);
          line-height: 1.45;
        }
      `}</style>
    </div>
  );
}

export function JpVocabRiskChart({ words }: Props) {
  const isMobile = useMobileRiskView();
  const { tickFontSize, barSize } = useChartLayout();
  const rows = useMemo(() => buildRiskChartData(words), [words]);
  const excludedCount = useMemo(() => countExcludedRiskRows(words), [words]);
  const xMax = useMemo(
    () => riskAxisMax(Math.max(...rows.map((r) => r.risk), 0)),
    [rows]
  );
  const xTicks = useMemo(() => riskAxisTicks(xMax), [xMax]);
  const yAxisWidth = useMemo(
    () => measureYAxisWidth(rows.map((r) => r.name), tickFontSize),
    [rows, tickFontSize]
  );
  const chartMinWidth = yAxisWidth + 280;

  const chartHeight = Math.max(
    240,
    Math.min(rows.length * (barSize + 18) + 72, 620)
  );

  if (!rows.length) {
    return (
      <p className="hint">
        {excludedCount > 0
          ? `当前 ${excludedCount} 个知识点抽查优先级为 0 或更低，暂无需要优先抽查的条目。`
          : "暂无知识点数据，无法生成抽查排行。"}
      </p>
    );
  }

  if (isMobile) {
    return <RiskMobileList rows={rows} xMax={xMax} excludedCount={excludedCount} />;
  }

  return (
    <div className="jp-vocab-risk-chart">
      <div className="jp-vocab-risk-chart-frame" style={{ height: chartHeight }}>
        <h3 className="jp-vocab-risk-chart-title">知识点抽查优先级（越高越建议先问）</h3>
        <div className="jp-vocab-risk-chart-canvas" style={{ minWidth: chartMinWidth }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={chartMinWidth}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 12, right: 20, left: 8, bottom: 32 }}
            barCategoryGap="18%"
          >
            <XAxis
              type="number"
              domain={[0, xMax]}
              ticks={xTicks}
              tick={{ fill: CHART_INK, fontSize: tickFontSize }}
              tickLine={{ stroke: CHART_INK }}
              axisLine={{ stroke: CHART_INK }}
              tickFormatter={(v) => Number(v).toFixed(1)}
            >
              <Label
                value={jpVocabPriorityLabel()}
                position="insideBottom"
                offset={-18}
                style={{ fill: CHART_INK, fontSize: tickFontSize + 1, textAnchor: "middle" }}
              />
            </XAxis>
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              allowDuplicatedCategory
              interval={0}
              tick={(props) => <YAxisTick {...props} fontSize={tickFontSize} />}
              tickLine={{ stroke: CHART_INK }}
              axisLine={{ stroke: CHART_INK }}
            />
            <Tooltip
              cursor={{ fill: "rgba(31, 119, 180, 0.12)" }}
              content={<RiskTooltip />}
            />
            <Bar
              dataKey="risk"
              fill={BAR_FILL}
              barSize={barSize}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      {excludedCount > 0 ? (
        <p className="jp-vocab-risk-chart-note">
          另有 {excludedCount} 个知识点抽查优先级为 0 或更低（未复习，或仅勾选「非常熟悉」），未列入上图。
        </p>
      ) : null}
      <style jsx>{`
        .jp-vocab-risk-chart {
          width: 100%;
        }
        .jp-vocab-risk-chart-frame {
          width: 100%;
          min-height: 240px;
          background: ${CHART_BG};
          border: 1px solid ${CHART_INK};
          border-radius: 0;
          padding: 0.65rem 0.5rem 0.35rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow-x: auto;
        }
        .jp-vocab-risk-chart-title {
          margin: 0 0 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          color: ${CHART_INK};
          text-align: center;
          line-height: 1.4;
          flex-shrink: 0;
        }
        .jp-vocab-risk-chart-canvas {
          flex: 1;
          min-height: 0;
          width: 100%;
        }
        .jp-vocab-risk-chart-frame :global(.recharts-cartesian-grid-horizontal line),
        .jp-vocab-risk-chart-frame :global(.recharts-cartesian-grid-vertical line) {
          stroke: ${CHART_GRID};
        }
        :global(.jp-vocab-risk-tooltip) {
          background: ${CHART_BG};
          border: 1px solid ${CHART_INK};
          border-radius: 2px;
          padding: 0.5rem 0.65rem;
          font-size: 0.8125rem;
          color: ${CHART_INK};
          line-height: 1.45;
          max-width: min(92vw, 280px);
          box-shadow: none;
        }
        :global(.jp-vocab-risk-tooltip p) {
          margin: 0.12rem 0;
        }
        :global(.jp-vocab-risk-tooltip-label) {
          color: #444444;
        }
        .jp-vocab-risk-chart-note {
          margin: 0.5rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }
      `}</style>
    </div>
  );
}
