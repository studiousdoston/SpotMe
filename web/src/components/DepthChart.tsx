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
import { formatDepth } from "@/lib/formatDepth";
import type { DepthSignal, RepResult } from "@/types/analysis";

// Same threshold as the server's depth_grade (server/analysis/squat.py).
const GOOD_DEPTH_THRESHOLD = 0.9;
// Extra y-range above the deepest point: the band where rep numbers are drawn.
const REP_LABEL_HEADROOM = 0.15;

// Chart colors for the dark surface: the accent for the one data line,
// quiet grays for everything else (grid, axes, labels, rep shading).
const CHART_COLORS = {
  line: "#a3e635", // --color-accent
  grid: "#2c2c2a",
  axis: "#383835",
  mutedText: "#a3a3a3", // neutral-400
  crosshair: "#525252", // neutral-600
  repShade: "#ffffff",
  tooltipBackground: "#171717", // neutral-900
} as const;

type DepthChartProps = {
  depthSignal: DepthSignal;
  reps: RepResult[];
};

type DepthChartPoint = {
  timeSeconds: number;
  depth: number | null;
};

// Depth over time, with each rep shaded and numbered and a dashed "good depth" line.
export function DepthChart({ depthSignal, reps }: DepthChartProps) {
  // Recharts wants one object per point.
  const chartPoints = useMemo<DepthChartPoint[]>(
    () =>
      depthSignal.timesSeconds.map((timeSeconds, pointIndex) => ({
        timeSeconds,
        depth: depthSignal.values[pointIndex] ?? null,
      })),
    [depthSignal],
  );

  return (
    <figure className="space-y-2">
      <figcaption className="space-y-0.5">
        <span className="block font-semibold">Depth over time</span>
        <span className="block text-sm text-neutral-400">0 = standing, 1 = hips at knee height.</span>
      </figcaption>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartPoints} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
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
              // Headroom above the deepest point keeps the rep numbers (top band) clear of the 0.9 line.
              domain={[
                (lowestValue: number) => Math.min(0, lowestValue),
                (highestValue: number) => Math.max(1.2, Math.ceil((highestValue + REP_LABEL_HEADROOM) * 10) / 10),
              ]}
              tickFormatter={(depthValue: number) => formatDepth(depthValue, 1)}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

            {/* Each counted rep, shaded and numbered to match the list below */}
            {reps.map((rep) => (
              <ReferenceArea
                key={rep.repNumber}
                x1={rep.startSeconds}
                x2={rep.endSeconds}
                fill={CHART_COLORS.repShade}
                fillOpacity={0.07}
                label={{ value: rep.repNumber, position: "insideTop", fill: CHART_COLORS.mutedText, fontSize: 12 }}
              />
            ))}

            <ReferenceLine
              y={GOOD_DEPTH_THRESHOLD}
              stroke={CHART_COLORS.mutedText}
              strokeDasharray="4 4"
              // Below the line, on the left: rep numbers live above the line, and videos start standing,
              // so the depth curve is near 0 there and never reaches this label.
              label={{ value: "good depth", position: "insideBottomLeft", fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

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
              formatter={(depthValue) => [typeof depthValue === "number" ? formatDepth(depthValue, 2) : "–", "Depth"]}
            />

            <Line
              type="monotone"
              dataKey="depth"
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
