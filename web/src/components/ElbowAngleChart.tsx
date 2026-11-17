import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ARM_CHART_COLORS, ARM_NAMES, ARM_SIDES } from "@/lib/curlArms";
import type { ArmSide, CurlAnalysisResult } from "@/types/analysis";

// Same threshold as the server's FULL_CURL_MAX_ANGLE (server/analysis/curl.py).
const FULL_CURL_MAX_ANGLE = 70;

// Quiet grays for everything that isn't data (same as DepthChart).
const CHART_COLORS = {
  grid: "#2c2c2a",
  axis: "#383835",
  mutedText: "#a3a3a3", // neutral-400
  crosshair: "#525252", // neutral-600
  tooltipBackground: "#171717", // neutral-900
} as const;

// One object per time point, with each arm's angle (null when unknown or the arm is hidden).
type ElbowAngleChartPoint = {
  timeSeconds: number;
} & Record<ArmSide, number | null>;

// Both arms' elbow angles over time (180° = straight arm), with a dashed "full curl" line at 70°.
export function ElbowAngleChart({ analysis }: { analysis: CurlAnalysisResult }) {
  // Arms that were counted (a hidden arm has no signal and gets no line).
  const chartedSides = ARM_SIDES.filter((armSide) => analysis.arms[armSide].elbowAngleSignal !== null);

  // Both signals come from the same server timeline, so their samples line up index by index.
  const chartPoints = useMemo<ElbowAngleChartPoint[]>(() => {
    const leftSignal = analysis.arms.left.elbowAngleSignal;
    const rightSignal = analysis.arms.right.elbowAngleSignal;
    const timesSeconds = (leftSignal ?? rightSignal)?.timesSeconds ?? [];
    return timesSeconds.map((timeSeconds, pointIndex) => ({
      timeSeconds,
      left: leftSignal?.values[pointIndex] ?? null,
      right: rightSignal?.values[pointIndex] ?? null,
    }));
  }, [analysis]);

  if (chartedSides.length === 0) return null;

  return (
    <figure className="space-y-2">
      <figcaption className="space-y-0.5">
        <span className="block font-semibold">Elbow angle over time</span>
        <span className="block text-sm text-neutral-400">180° = straight arm. Below the dashed line = full curl.</span>
      </figcaption>

      {/* Legend: the swatch carries the color, the text stays neutral */}
      <ul className="flex gap-4 text-sm text-neutral-300">
        {chartedSides.map((armSide) => (
          <li key={armSide} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: ARM_CHART_COLORS[armSide] }} />
            {ARM_NAMES[armSide]} arm
          </li>
        ))}
      </ul>

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
              domain={[0, 180]}
              ticks={[0, 45, 90, 135, 180]}
              tickFormatter={(angleDegrees: number) => `${angleDegrees}°`}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

            <ReferenceLine
              y={FULL_CURL_MAX_ANGLE}
              stroke={CHART_COLORS.mutedText}
              strokeDasharray="4 4"
              label={{ value: "full curl", position: "insideBottomLeft", fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

            {/* Crosshair + both arms' values on hover/tap */}
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
              formatter={(angleDegrees, armName) => [
                typeof angleDegrees === "number" ? `${Math.round(angleDegrees)}°` : "–",
                armName,
              ]}
            />

            {chartedSides.map((armSide) => (
              <Line
                key={armSide}
                type="monotone"
                dataKey={armSide}
                name={ARM_NAMES[armSide]}
                stroke={ARM_CHART_COLORS[armSide]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: CHART_COLORS.tooltipBackground, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
