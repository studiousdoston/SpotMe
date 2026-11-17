import type { ArmSide, CurlAnalysisResult, CurlArmResult } from "@/types/analysis";

// Display order and labels for the two arms (the person's own left and right).
export const ARM_SIDES: ArmSide[] = ["left", "right"];
export const ARM_NAMES: Record<ArmSide, string> = { left: "Left", right: "Right" };

// Chart colors per arm: categorical slots 1 (blue) and 2 (orange) for a dark surface,
// checked with the dataviz palette validator (CVD-safe, >= 3:1 on neutral-950).
export const ARM_CHART_COLORS: Record<ArmSide, string> = { left: "#3987e5", right: "#d95926" };

// "5", or "hidden" when the arm couldn't be counted.
export function formatArmCount(armResult: CurlArmResult): string {
  return armResult.repCount === null ? "hidden" : armResult.repCount.toString();
}

// Full and total curls over both counted arms (for the "8/10 full curls" chip).
export function countFullCurls(analysis: CurlAnalysisResult): { fullCount: number; totalCount: number } {
  const allReps = ARM_SIDES.flatMap((armSide) => analysis.arms[armSide].reps);
  return {
    fullCount: allReps.filter((rep) => rep.rangeFeedback.code === "full_curl").length,
    totalCount: allReps.length,
  };
}
