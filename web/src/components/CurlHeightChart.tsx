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
import { curlHeightPercent } from "@/lib/pose/overlayState";
import type { ArmSide, CurlAnalysisResult, CurlArmResult } from "@/types/analysis";

// Same threshold as the server's FULL_CURL_MIN_PERCENT (server/analysis/curl.py).
const FULL_CURL_MIN_PERCENT = 70;

// Quiet grays for everything that isn't data (same as DepthChart).
const CHART_COLORS = {
  grid: "#2c2c2a",
  axis: "#383835",
  mutedText: "#a3a3a3", // neutral-400
  crosshair: "#525252", // neutral-600
  tooltipBackground: "#171717", // neutral-900
} as const;

// One object per time point, with each arm's curl height % (null when unknown or the arm is hidden).
type CurlHeightChartPoint = {
  timeSeconds: number;
} & Record<ArmSide, number | null>;

// One arm's curl height % at a sample (null when the arm wasn't counted or the value is unknown).
function armHeightPercentAt(armResult: CurlArmResult, pointIndex: number): number | null {
  const wristHeight = armResult.wristHeightSignal?.values[pointIndex] ?? null;
  if (wristHeight === null || armResult.hangingBaseline === null) return null;
  return curlHeightPercent(wristHeight, armResult.hangingBaseline);
}

// Both arms' curl height over time (0% = arm hanging, 100% = wrist at shoulder level),
// with a dashed "full curl" line at 70%.
export function CurlHeightChart({ analysis }: { analysis: CurlAnalysisResult }) {
  // Arms that were counted (a hidden arm has no signal and gets no line).
  const chartedSides = ARM_SIDES.filter((armSide) => analysis.arms[armSide].wristHeightSignal !== null);

  // Both signals come from the same server timeline, so their samples line up index by index.
  const chartPoints = useMemo<CurlHeightChartPoint[]>(() => {
    const { left: leftArm, right: rightArm } = analysis.arms;
    const timesSeconds = (leftArm.wristHeightSignal ?? rightArm.wristHeightSignal)?.timesSeconds ?? [];
    return timesSeconds.map((timeSeconds, pointIndex) => ({
      timeSeconds,
      left: armHeightPercentAt(leftArm, pointIndex),
      right: armHeightPercentAt(rightArm, pointIndex),
    }));
  }, [analysis]);

  if (chartedSides.length === 0) return null;

  return (
    <figure className="space-y-2">
      <figcaption className="space-y-0.5">
        <span className="block font-semibold">Curl height over time</span>
        <span className="block text-sm text-neutral-400">0% = arm hanging, 100% = wrist at shoulder level. Above the dashed line = full curl.</span>
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
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(heightPercent: number) => `${heightPercent}%`}
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.mutedText, fontSize: 12 }}
            />

            <ReferenceLine
              y={FULL_CURL_MIN_PERCENT}
              stroke={CHART_COLORS.mutedText}
              strokeDasharray="4 4"
              label={{ value: "full curl", position: "insideTopLeft", fill: CHART_COLORS.mutedText, fontSize: 12 }}
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
              formatter={(heightPercent, armName) => [
                typeof heightPercent === "number" ? `${Math.round(heightPercent)}%` : "–",
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
