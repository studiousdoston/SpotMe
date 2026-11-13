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

// Sizes are multiples of one "unit" = 1% of the DISPLAYED video's short side (CSS px),
// never less than MIN_UNIT_CSS_PX. With the counter at 6 units and labels at 4 units,
// a 3 px minimum unit gives exactly the minimum readable sizes: counter 18 px, labels 12 px.
const UNIT_FRACTION_OF_SHORT_SIDE = 0.01;
const MIN_UNIT_CSS_PX = 3;
// The panel should cover at most this share of the displayed video height.
const MAX_PANEL_HEIGHT_FRACTION = 0.4;
// When even that is too tall, the meter may shrink down to this (in units) before readability suffers.
const MIN_METER_HEIGHT_UNITS = 6;

// Sizes in units (multiplied by the unit when computing a layout).
const SIZE_UNITS = {
  margin: 3,
  padding: 2.5,
  cornerRadius: 2.5,
  gap: 1.5,
  counterFontSize: 6,
  labelFontSize: 4,
  meterWidth: 4,
  meterHeight: 14,
  badgeHeight: 7,
  badgeFontSize: 4,
  badgePaddingX: 2.5,
} as const;

// All sizes are in CANVAS pixels (CSS px × devicePixelRatio), ready to draw with.
export type OverlayLayout = {
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
  // False on very small players: the "Depth 0.82" line is dropped to keep the panel short.
  showDepthText: boolean;
  // Panel height (its width depends on text, measured when drawing).
  panelHeight: number;
};

// Panel height in units: padding · counter · gap · meter [· gap · depth text] · padding.
function panelHeightInUnits(meterHeightUnits: number, showDepthText: boolean): number {
  const depthTextUnits = showDepthText ? SIZE_UNITS.gap + SIZE_UNITS.labelFontSize : 0;
  return (
    2 * SIZE_UNITS.padding + SIZE_UNITS.counterFontSize + SIZE_UNITS.gap + meterHeightUnits + depthTextUnits
  );
}

// Layout for a video displayed at displayWidth × displayHeight CSS px.
// Rules, in priority order:
//   1. readability: counter >= 18 CSS px, labels >= 12 CSS px (unit >= 3 px);
//   2. the panel covers at most ~40% of the displayed height. If it doesn't fit, first drop the
//      "Depth 0.82" line, then shrink the meter (down to MIN_METER_HEIGHT_UNITS). If it still
//      doesn't fit (tiny player), readability wins and the panel is allowed to be taller.
export function computeOverlayLayout(
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio: number = 1,
): OverlayLayout {
  const unitCss = Math.max(MIN_UNIT_CSS_PX, Math.min(displayWidth, displayHeight) * UNIT_FRACTION_OF_SHORT_SIDE);
  const maxPanelHeightUnits = (MAX_PANEL_HEIGHT_FRACTION * displayHeight) / unitCss;

  let showDepthText = true;
  let meterHeightUnits: number = SIZE_UNITS.meterHeight;
  if (panelHeightInUnits(meterHeightUnits, true) > maxPanelHeightUnits) {
    showDepthText = false;
    const spareUnits = maxPanelHeightUnits - panelHeightInUnits(0, false);
    meterHeightUnits = Math.max(MIN_METER_HEIGHT_UNITS, Math.min(SIZE_UNITS.meterHeight, spareUnits));
  }

  // Convert units to canvas pixels.
  const unit = unitCss * devicePixelRatio;
  return {
    unit,
    margin: SIZE_UNITS.margin * unit,
    padding: SIZE_UNITS.padding * unit,
    cornerRadius: SIZE_UNITS.cornerRadius * unit,
    gap: SIZE_UNITS.gap * unit,
    counterFontSize: SIZE_UNITS.counterFontSize * unit,
    labelFontSize: SIZE_UNITS.labelFontSize * unit,
    meterWidth: SIZE_UNITS.meterWidth * unit,
    meterHeight: meterHeightUnits * unit,
    badgeHeight: SIZE_UNITS.badgeHeight * unit,
    badgeFontSize: SIZE_UNITS.badgeFontSize * unit,
    badgePaddingX: SIZE_UNITS.badgePaddingX * unit,
    showDepthText,
    panelHeight: panelHeightInUnits(meterHeightUnits, showDepthText) * unit,
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
