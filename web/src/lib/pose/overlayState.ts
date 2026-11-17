// Pure overlay logic: what the coaching overlay should show at a given video time,
// and how big everything is for a given canvas size. No drawing, no DOM.
// Only type imports here, so the file also runs directly under `node --test`.
//
// Shared by every exercise: rep timing (counter, active rep, grade pop-up), signal
// interpolation, skeleton tints and the panel layout. Each exercise adds its own
// state on top (squat: depth meter; curl: per-arm counters and curl heights).

import type {
  AnalysisResult,
  ArmSide,
  CurlAnalysisResult,
  CurlArmResult,
  Feedback,
  SquatAnalysisResult,
  SquatRepResult,
  TimeSeries,
} from "@/types/analysis";

// The grade pop-up stays this long after a rep ends, fading out during the last part.
export const GRADE_POPUP_SECONDS = 2;
export const GRADE_POPUP_FADE_SECONDS = 0.5;

// ---- Shared types ----

// Any rep with a time window and a moment it "counts" (squat bottom, curl top).
export type TimedRep = {
  repNumber: number;
  startSeconds: number;
  endSeconds: number;
};

// One colored badge; armLabel ("L"/"R") is put in front of the text for per-arm exercises.
export type PopupBadge = {
  feedback: Feedback;
  armLabel: string | null;
};

// Badges shown together after one rep, fading out together.
export type GradePopup = {
  repNumber: number;
  badges: PopupBadge[];
  // 1 = fully visible, 0 = gone.
  opacity: number;
};

// Skeleton lines to tint with a feedback code's color: "all" lines, or only these connections.
export type SkeletonTint = {
  connections: "all" | ReadonlyArray<readonly [number, number]>;
  feedbackCode: string;
};

type SharedOverlayState = {
  // Drawn left to right in one row under the panel.
  gradePopups: GradePopup[];
  // Empty outside reps: the skeleton keeps its default color.
  skeletonTints: SkeletonTint[];
};

export type SquatOverlayState = SharedOverlayState & {
  exercise: "squat";
  // A rep counts once the playhead has passed its bottom.
  completedRepCount: number;
  totalRepCount: number;
  // The rep whose window [start, end) contains the playhead, if any.
  activeRep: SquatRepResult | null;
  // Depth at the playhead, interpolated from the depth signal (null when unknown).
  currentDepth: number | null;
};

// Null when the arm is hidden (not counted).
export type CurlArmOverlayState = {
  // A curl counts once the playhead has passed its top.
  completedRepCount: number;
  totalRepCount: number;
  // Curl height % at the playhead: 0 = arm hanging, 100 = wrist at shoulder level (null when unknown).
  currentHeightPercent: number | null;
} | null;

export type CurlOverlayState = SharedOverlayState & {
  exercise: "curl";
  arms: Record<ArmSide, CurlArmOverlayState>;
};

export type OverlayState = SquatOverlayState | CurlOverlayState;

// Skeleton connections of each arm (shoulder → elbow → wrist), as in skeleton.ts.
export const ARM_CONNECTIONS: Record<ArmSide, ReadonlyArray<readonly [number, number]>> = {
  left: [
    [11, 13],
    [13, 15],
  ],
  right: [
    [12, 14],
    [14, 16],
  ],
};

// ---- State at a time (shared) ----

// Reps whose counting moment (bottom / top) the playhead has passed.
export function countRepsPast(countingMomentsSeconds: number[], timeSeconds: number): number {
  return countingMomentsSeconds.filter((momentSeconds) => timeSeconds >= momentSeconds).length;
}

export function countCompletedReps(reps: SquatRepResult[], timeSeconds: number): number {
  return countRepsPast(
    reps.map((rep) => rep.bottomSeconds),
    timeSeconds,
  );
}

export function findActiveRep<Rep extends TimedRep>(reps: Rep[], timeSeconds: number): Rep | null {
  return reps.find((rep) => timeSeconds >= rep.startSeconds && timeSeconds < rep.endSeconds) ?? null;
}

// Linear interpolation between the two samples around timeSeconds.
// Clamps to the first/last sample outside the signal; uses the non-null neighbour if one is missing.
export function interpolateSignal(signal: TimeSeries, timeSeconds: number): number | null {
  const { timesSeconds, values } = signal;
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

// The most recently finished rep, for GRADE_POPUP_SECONDS after its end, with its fade opacity.
export function findRecentlyFinishedRep<Rep extends TimedRep>(
  reps: Rep[],
  timeSeconds: number,
): { rep: Rep; opacity: number } | null {
  const finishedRecently = reps.filter(
    (rep) => timeSeconds >= rep.endSeconds && timeSeconds < rep.endSeconds + GRADE_POPUP_SECONDS,
  );
  const latestRep = finishedRecently.at(-1);
  if (latestRep === undefined) return null;

  const secondsLeft = latestRep.endSeconds + GRADE_POPUP_SECONDS - timeSeconds;
  return { rep: latestRep, opacity: Math.min(1, secondsLeft / GRADE_POPUP_FADE_SECONDS) };
}

// ---- State at a time (per exercise) ----

function computeSquatOverlayState(analysis: SquatAnalysisResult, timeSeconds: number): SquatOverlayState {
  const activeRep = findActiveRep(analysis.reps, timeSeconds);
  const finishedRep = findRecentlyFinishedRep(analysis.reps, timeSeconds);
  return {
    exercise: "squat",
    completedRepCount: countCompletedReps(analysis.reps, timeSeconds),
    totalRepCount: analysis.reps.length,
    activeRep,
    currentDepth: analysis.depthSignal ? interpolateSignal(analysis.depthSignal, timeSeconds) : null,
    // Depth + tempo badges after each squat.
    gradePopups:
      finishedRep === null
        ? []
        : [
            {
              repNumber: finishedRep.rep.repNumber,
              badges: [
                { feedback: finishedRep.rep.depthFeedback, armLabel: null },
                { feedback: finishedRep.rep.tempoFeedback, armLabel: null },
              ],
              opacity: finishedRep.opacity,
            },
          ],
    // The whole skeleton takes the active rep's depth grade color.
    skeletonTints: activeRep === null ? [] : [{ connections: "all", feedbackCode: activeRep.depthFeedback.code }],
  };
}

const ARM_LABELS: Record<ArmSide, string> = { left: "L", right: "R" };
const ARM_SIDES: ArmSide[] = ["left", "right"];

// Wrist height (upper-arm lengths) → curl height %: the arm's hanging baseline is 0%, shoulder
// level (0) is 100%, clamped to 0–100. Same formula as the server's curl_height_percent.
export function curlHeightPercent(wristHeight: number, hangingBaseline: number): number {
  if (hangingBaseline >= 0) return 0;
  const percent = ((wristHeight - hangingBaseline) / (0 - hangingBaseline)) * 100;
  return Math.min(100, Math.max(0, percent));
}

function computeCurlArmOverlayState(armResult: CurlArmResult, timeSeconds: number): CurlArmOverlayState {
  if (armResult.repCount === null) return null;
  const { wristHeightSignal, hangingBaseline } = armResult;
  const currentWristHeight = wristHeightSignal ? interpolateSignal(wristHeightSignal, timeSeconds) : null;
  return {
    completedRepCount: countRepsPast(
      armResult.reps.map((rep) => rep.peakSeconds),
      timeSeconds,
    ),
    totalRepCount: armResult.repCount,
    currentHeightPercent:
      currentWristHeight === null || hangingBaseline === null
        ? null
        : curlHeightPercent(currentWristHeight, hangingBaseline),
  };
}

function computeCurlOverlayState(analysis: CurlAnalysisResult, timeSeconds: number): CurlOverlayState {
  const gradePopups: GradePopup[] = [];
  const skeletonTints: SkeletonTint[] = [];
  for (const armSide of ARM_SIDES) {
    const armReps = analysis.arms[armSide].reps;

    // "L Full" / "R Partial" after each curl of this arm.
    const finishedRep = findRecentlyFinishedRep(armReps, timeSeconds);
    if (finishedRep !== null) {
      gradePopups.push({
        repNumber: finishedRep.rep.repNumber,
        badges: [{ feedback: finishedRep.rep.rangeFeedback, armLabel: ARM_LABELS[armSide] }],
        opacity: finishedRep.opacity,
      });
    }

    // Only this arm's lines take the curl's grade color while it's curling.
    const activeRep = findActiveRep(armReps, timeSeconds);
    if (activeRep !== null) {
      skeletonTints.push({ connections: ARM_CONNECTIONS[armSide], feedbackCode: activeRep.rangeFeedback.code });
    }
  }

  return {
    exercise: "curl",
    arms: {
      left: computeCurlArmOverlayState(analysis.arms.left, timeSeconds),
      right: computeCurlArmOverlayState(analysis.arms.right, timeSeconds),
    },
    gradePopups,
    skeletonTints,
  };
}

// Everything the overlay shows at this time. Null when there's nothing to coach
// (a result that wasn't counted: low visibility, or not filmed from the front).
export function computeOverlayState(analysis: AnalysisResult, timeSeconds: number): OverlayState | null {
  if (analysis.status !== "ok") return null;
  return analysis.exercise === "squat"
    ? computeSquatOverlayState(analysis, timeSeconds)
    : computeCurlOverlayState(analysis, timeSeconds);
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

// What the panel contains, which decides its height:
// counter · [meter] · detail line (squat: "Depth 0.82"; curl: the elbow angles).
export type PanelShape = {
  hasMeter: boolean;
};

export const SQUAT_PANEL_SHAPE: PanelShape = { hasMeter: true };
export const CURL_PANEL_SHAPE: PanelShape = { hasMeter: false };

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
  // 0 when the panel has no meter.
  meterHeight: number;
  badgeHeight: number;
  badgeFontSize: number;
  badgePaddingX: number;
  // False on very small players: the detail line ("Depth 0.82") is dropped to keep the panel short.
  showDetailText: boolean;
  // Panel height (its width depends on text, measured when drawing).
  panelHeight: number;
};

// Panel height in units: padding · counter · [gap · meter] · [gap · detail text] · padding.
function panelHeightInUnits(meterHeightUnits: number | null, showDetailText: boolean): number {
  const meterUnits = meterHeightUnits === null ? 0 : SIZE_UNITS.gap + meterHeightUnits;
  const detailTextUnits = showDetailText ? SIZE_UNITS.gap + SIZE_UNITS.labelFontSize : 0;
  return 2 * SIZE_UNITS.padding + SIZE_UNITS.counterFontSize + meterUnits + detailTextUnits;
}

// Layout for a video displayed at displayWidth × displayHeight CSS px.
// Rules, in priority order:
//   1. readability: counter >= 18 CSS px, labels >= 12 CSS px (unit >= 3 px);
//   2. the panel covers at most ~40% of the displayed height. If it doesn't fit, first drop the
//      detail line, then shrink the meter (down to MIN_METER_HEIGHT_UNITS). If it still
//      doesn't fit (tiny player), readability wins and the panel is allowed to be taller.
export function computeOverlayLayout(
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio: number = 1,
  panelShape: PanelShape = SQUAT_PANEL_SHAPE,
): OverlayLayout {
  const unitCss = Math.max(MIN_UNIT_CSS_PX, Math.min(displayWidth, displayHeight) * UNIT_FRACTION_OF_SHORT_SIDE);
  const maxPanelHeightUnits = (MAX_PANEL_HEIGHT_FRACTION * displayHeight) / unitCss;

  let showDetailText = true;
  let meterHeightUnits: number | null = panelShape.hasMeter ? SIZE_UNITS.meterHeight : null;
  if (panelHeightInUnits(meterHeightUnits, true) > maxPanelHeightUnits) {
    showDetailText = false;
    if (meterHeightUnits !== null) {
      const spareUnits = maxPanelHeightUnits - panelHeightInUnits(0, false);
      meterHeightUnits = Math.max(MIN_METER_HEIGHT_UNITS, Math.min(SIZE_UNITS.meterHeight, spareUnits));
    }
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
    meterHeight: (meterHeightUnits ?? 0) * unit,
    badgeHeight: SIZE_UNITS.badgeHeight * unit,
    badgeFontSize: SIZE_UNITS.badgeFontSize * unit,
    badgePaddingX: SIZE_UNITS.badgePaddingX * unit,
    showDetailText,
    panelHeight: panelHeightInUnits(meterHeightUnits, showDetailText) * unit,
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
