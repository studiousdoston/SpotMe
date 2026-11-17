import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PushupAnalysisResult, PushupRepResult, TimeSeries } from "@/types/analysis";

// Same threshold as the server's GOOD_DEPTH_MAX_ANGLE (server/analysis/pushup.py).
const GOOD_DEPTH_MAX_ANGLE = 90;

// Chart colors for the dark surface (same as DepthChart): the accent for the one data line,
// quiet grays for everything else.
const CHART_COLORS = {
  line: "#a3e635", // --color-accent
  grid: "#2c2c2a",
  axis: "#383835",
  mutedText: "#a3a3a3", // neutral-400
  crosshair: "#525252", // neutral-600
  repShade: "#ffffff",
  tooltipBackground: "#171717", // neutral-900
} as const;

// What differs between the two charts: the signal, its axis and labels, and the optional guide line.
type PushupChartConfig = {
  signal: TimeSeries;
  title: string;
  caption: string;
  valueName: string;
  yDomain: [number | "auto", number | "auto"];
  yTicks: number[] | undefined;
  formatValue: (value: number) => string;
  guideLine: { value: number; label: string } | null;
};

// Elbow angle when depth was graded (front view), otherwise body height (side view).
function chartConfig(analysis: PushupAnalysisResult): PushupChartConfig | null {
  if (analysis.depthGraded && analysis.elbowAngleSignal !== null) {
    return {
      signal: analysis.elbowAngleSignal,
      title: "Elbow angle over time",
      caption: "180° = straight arms. Below the dashed line = good depth.",
      valueName: "Elbow",
      yDomain: [0, 180],
      yTicks: [0, 45, 90, 135, 180],
      formatValue: (angleDegrees) => `${Math.round(angleDegrees)}°`,
      guideLine: { value: GOOD_DEPTH_MAX_ANGLE, label: "good depth" },
    };
  }
  if (analysis.bodyHeightSignal !== null) {
    return {
      signal: analysis.bodyHeightSignal,
      title: "Body height over time",
      caption: "Shoulders above the hands, in arm lengths. Each dip is a push-up.",
      valueName: "Height",
      yDomain: [0, "auto"],
      yTicks: undefined,
      formatValue: (armLengths) => armLengths.toFixed(2),
      guideLine: null,
    };
  }
  return null;
}

type PushupChartPoint = {
  timeSeconds: number;
  value: number | null;
};

// One line over time, each push-up shaded and numbered to match the rep list.
export function PushupChart({ analysis }: { analysis: PushupAnalysisResult }) {
  const config = useMemo(() => chartConfig(analysis), [analysis]);

  // Recharts wants one object per point.
  const chartPoints = useMemo<PushupChartPoint[]>(
    () =>
      config === null
        ? []
        : config.signal.timesSeconds.map((timeSeconds, pointIndex) => ({
            timeSeconds,
            value: config.signal.values[pointIndex] ?? null,
          })),
    [config],
  );

  if (config === null) return null;

  return (
    <figure className="space-y-2">
      <figcaption className="space-y-0.5">
        <span className="block font-semibold">{config.title}</span>
        <span className="block text-sm text-neutral-400">{config.caption}</span>
      </figcaption>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="timeSeconds"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(timeSeconds: number) => `${Math.round(timeSeconds)}s`}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />
            <YAxis
              domain={config.yDomain}
              ticks={config.yTicks}
              tickFormatter={config.formatValue}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

            {/* Each push-up, shaded and numbered at the bottom (the line is high between reps) */}
            {analysis.reps.map((rep: PushupRepResult) => (
              <ReferenceArea
                key={rep.repNumber}
                x1={rep.startSeconds}
                x2={rep.endSeconds}
                fill={CHART_COLORS.repShade}
                fillOpacity={0.07}
                label={{ value: rep.repNumber, position: "insideBottom", fill: CHART_COLORS.mutedText, fontSize: 12 }}
              />
            ))}

            {config.guideLine !== null && (
              <ReferenceLine
                y={config.guideLine.value}
                stroke={CHART_COLORS.mutedText}
                strokeDasharray="4 4"
                label={{
                  value: config.guideLine.label,
                  position: "insideTopLeft",
                  fill: CHART_COLORS.mutedText,
                  fontSize: 12,
                }}
              />
            )}

            {/* Crosshair + value on hover/tap */}
            <Tooltip
              cursor={{ stroke: CHART_COLORS.crosshair }}
              contentStyle={{
                background: CHART_COLORS.tooltipBackground,
                border: `1px solid ${CHART_COLORS.axis}`,
                borderRadius: 8,
              }}
              labelStyle={{ color: CHART_COLORS.mutedText }}
              itemStyle={{ color: "#f5f5f5" }}
              labelFormatter={(timeSeconds) => `${Number(timeSeconds).toFixed(2)} s`}
              formatter={(value) => [typeof value === "number" ? config.formatValue(value) : "–", config.valueName]}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS.line}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: CHART_COLORS.tooltipBackground, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
