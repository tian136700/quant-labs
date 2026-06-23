"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRiskChartData, countExcludedRiskRows, type JpVocabRiskRow } from "@/lib/jp-vocab-risk";
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

/** Matplotlib 默认蓝 */
const BAR_FILL = "#1f77b4";
const CHART_BG = "#ffffff";
const CHART_INK = "#000000";
const CHART_GRID = "#cccccc";

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
        <span className="jp-vocab-risk-tooltip-label">风险指数：</span>
        {row.risk}
      </p>
    </div>
  );
}

export function JpVocabRiskChart({ words }: Props) {
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
          ? `当前 ${excludedCount} 个知识点风险指数为 0 或更低，暂无需要优先抽查的条目。`
          : "暂无知识点数据，无法生成风险排行。"}
      </p>
    );
  }

  return (
    <div className="jp-vocab-risk-chart">
      <div className="jp-vocab-risk-chart-frame" style={{ height: chartHeight }}>
        <h3 className="jp-vocab-risk-chart-title">知识点风险排行（越高越建议抽查）</h3>
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
                value="风险指数"
                position="insideBottom"
                offset={-18}
                style={{ fill: CHART_INK, fontSize: tickFontSize + 1, textAnchor: "middle" }}
              />
            </XAxis>
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
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
          另有 {excludedCount} 个知识点风险指数为 0 或更低（未复习，或仅勾选「非常熟悉」），未列入上图。
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
