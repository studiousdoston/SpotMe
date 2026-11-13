// Pure overlay logic: what the coaching overlay should show at a given video time,
// and how big everything is for a given canvas size. No drawing, no DOM.
// Only type imports here, so the file also runs directly under `node --test`.

import type { AnalysisResult, DepthSignal, Feedback, RepResult } from "@/types/analysis";

// The grade pop-up stays this long after a rep ends, fading out during the last part.
export const GRADE_POPUP_SECONDS = 2;
export const GRADE_POPUP_FADE_SECONDS = 0.5;

export type GradePopup = {
  repNumber: number;
  depthFeedback: Feedback;
  tempoFeedback: Feedback;
  // 1 = fully visible, 0 = gone.
  opacity: number;
};

export type OverlayState = {
  // A rep counts once the playhead has passed its bottom.
  completedRepCount: number;
  totalRepCount: number;
  // The rep whose window [start, end) contains the playhead, if any.
  activeRep: RepResult | null;
  // Depth at the playhead, interpolated from the depth signal (null when unknown).
  currentDepth: number | null;
  gradePopup: GradePopup | null;
  // Depth feedback code of the active rep (tints the skeleton), or null outside reps.
  skeletonFeedbackCode: string | null;
};

// ---- State at a time ----

export function countCompletedReps(reps: RepResult[], timeSeconds: number): number {
  return reps.filter((rep) => timeSeconds >= rep.bottomSeconds).length;
}

export function findActiveRep(reps: RepResult[], timeSeconds: number): RepResult | null {
  return reps.find((rep) => timeSeconds >= rep.startSeconds && timeSeconds < rep.endSeconds) ?? null;
}

// Linear interpolation between the two depth samples around timeSeconds.
// Clamps to the first/last sample outside the signal; uses the non-null neighbour if one is missing.
export function interpolateDepth(depthSignal: DepthSignal, timeSeconds: number): number | null {
  const { timesSeconds, values } = depthSignal;
  if (timesSeconds.length === 0) return null;
  if (timeSeconds <= timesSeconds[0]) return values[0];
  const lastIndex = timesSeconds.length - 1;
  if (timeSeconds >= timesSeconds[lastIndex]) return values[lastIndex];

  // Binary search for the first sample at or after timeSeconds.
  let lowIndex = 0;
  let highIndex = lastIndex;
  while (lowIndex < highIndex) {
    const middleIndex = Math.floor((lowIndex + highIndex) / 2);
    if (timesSeconds[middleIndex] < timeSeconds) lowIndex = middleIndex + 1;
    else highIndex = middleIndex;
  }

  const valueAfter = values[lowIndex];
  const valueBefore = values[lowIndex - 1];
  if (valueBefore === null || valueAfter === null) return valueBefore ?? valueAfter;

  const timeBefore = timesSeconds[lowIndex - 1];
  const timeAfter = timesSeconds[lowIndex];
  const fraction = (timeSeconds - timeBefore) / (timeAfter - timeBefore);
  return valueBefore + fraction * (valueAfter - valueBefore);
}

// The most recently finished rep, for GRADE_POPUP_SECONDS after its end (fading at the end).
export function findGradePopup(reps: RepResult[], timeSeconds: number): GradePopup | null {
  const finishedRecently = reps.filter(
    (rep) => timeSeconds >= rep.endSeconds && timeSeconds < rep.endSeconds + GRADE_POPUP_SECONDS,
  );
  const latestRep = finishedRecently.at(-1);
  if (latestRep === undefined) return null;

  const secondsLeft = latestRep.endSeconds + GRADE_POPUP_SECONDS - timeSeconds;
  return {
    repNumber: latestRep.repNumber,
    depthFeedback: latestRep.depthFeedback,
    tempoFeedback: latestRep.tempoFeedback,
    opacity: Math.min(1, secondsLeft / GRADE_POPUP_FADE_SECONDS),
  };
}

// Everything the overlay shows at this time. Null when there's nothing to coach
// (e.g. a low-visibility result with no reps or depth curve).
export function computeOverlayState(analysis: AnalysisResult, timeSeconds: number): OverlayState | null {
  if (analysis.status !== "ok") return null;
  const activeRep = findActiveRep(analysis.reps, timeSeconds);
  return {
    completedRepCount: countCompletedReps(analysis.reps, timeSeconds),
    totalRepCount: analysis.reps.length,
    activeRep,
    currentDepth: analysis.depthSignal ? interpolateDepth(analysis.depthSignal, timeSeconds) : null,
    gradePopup: findGradePopup(analysis.reps, timeSeconds),
    skeletonFeedbackCode: activeRep?.depthFeedback.code ?? null,
  };
}

// ---- Layout ----

// The depth meter runs from 0 (standing) to this depth (below knee height).
export const METER_MAX_DEPTH = 1.2;

export type OverlayLayout = {
  // 1% of the frame's short side: every size below is a multiple of it, so the overlay
  // keeps the same proportions on any resolution, portrait or landscape.
  unit: number;
  margin: number;
  padding: number;
  cornerRadius: number;
  gap: number;
  counterFontSize: number;
  labelFontSize: number;
  meterWidth: number;
  meterHeight: number;
  badgeHeight: number;
  badgeFontSize: number;
  badgePaddingX: number;
  // Panel height (its width depends on text, measured when drawing).
  panelHeight: number;
};

export function computeOverlayLayout(canvasWidth: number, canvasHeight: number): OverlayLayout {
  const unit = Math.min(canvasWidth, canvasHeight) / 100;
  const padding = 2.5 * unit;
  const gap = 1.5 * unit;
  const counterFontSize = 6 * unit;
  const labelFontSize = 4 * unit;
  const meterHeight = 14 * unit;
  return {
    unit,
    margin: 3 * unit,
    padding,
    cornerRadius: 2.5 * unit,
    gap,
    counterFontSize,
    labelFontSize,
    meterWidth: 4 * unit,
    meterHeight,
    badgeHeight: 7 * unit,
    badgeFontSize: 4 * unit,
    badgePaddingX: 2.5 * unit,
    // padding · counter · gap · meter · gap · depth label · padding
    panelHeight: padding + counterFontSize + gap + meterHeight + gap + labelFontSize + padding,
  };
}

// Total height from the top of the frame to the bottom of the grade pop-up (one row of badges).
export function overlayTotalHeight(layout: OverlayLayout): number {
  return layout.margin + layout.panelHeight + layout.gap + layout.badgeHeight;
}

// Where a depth value sits on the meter: 0 at the bottom, 1 at the top (clamped).
export function meterFillFraction(depth: number): number {
  return Math.min(1, Math.max(0, depth / METER_MAX_DEPTH));
}
