// Canvas drawing for the coaching overlay (broadcast-style panel + grade pop-up),
// and one entry point that renders a full replay frame (skeleton + overlay).
// Works on any 2D canvas, so it can be reused for live camera mode and video export.

import { FEEDBACK_TONE_COLORS, getFeedbackTone, getShortFeedbackText } from "@/lib/feedbackTone";
import { formatDepth } from "@/lib/formatDepth";
import { findNearestFrame } from "@/lib/pose/findNearestFrame";
import {
  computeOverlayLayout,
  computeOverlayState,
  CURL_PANEL_SHAPE,
  meterFillFraction,
  SQUAT_PANEL_SHAPE,
  type CurlArmOverlayState,
  type CurlOverlayState,
  type GradePopup,
  type OverlayLayout,
  type OverlayState,
  type PopupBadge,
  type SkeletonTint,
  type SquatOverlayState,
} from "@/lib/pose/overlayState";
import { drawSkeleton, SKELETON_LINE_COLOR } from "@/lib/pose/skeleton";
import type { AnalysisResult } from "@/types/analysis";
import type { PoseRecording } from "@/types/pose";

// Same threshold as the server's depth_grade.
const GOOD_DEPTH_THRESHOLD = 0.9;

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const OVERLAY_COLORS = {
  panelBackground: "rgba(10, 10, 10, 0.62)",
  text: "#f5f5f5",
  mutedText: "#d4d4d4",
  meterTrack: "rgba(255, 255, 255, 0.18)",
  meterFill: SKELETON_LINE_COLOR, // accent
  tick: "#ffffff",
  badgeText: "#0a0a0a",
} as const;

function setFont(context: CanvasRenderingContext2D, fontSize: number, fontWeight: number): void {
  context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
}

// ---- Panel content per exercise ----

// What the panel shows: a big counter line, an optional meter, and one detail line.
type PanelContent = {
  counterText: string;
  meter: { fillFraction: number; tickFraction: number; tickLabel: string } | null;
  detailText: string;
};

// Squat: "Rep 3 / 6", depth meter with a "good" tick, "Depth 0.82".
function squatPanelContent(overlayState: SquatOverlayState): PanelContent {
  const { currentDepth } = overlayState;
  return {
    counterText: `Rep ${overlayState.completedRepCount} / ${overlayState.totalRepCount}`,
    meter: {
      fillFraction: currentDepth === null ? 0 : meterFillFraction(currentDepth),
      tickFraction: meterFillFraction(GOOD_DEPTH_THRESHOLD),
      tickLabel: "good",
    },
    detailText: `Depth ${currentDepth === null ? "–" : formatDepth(currentDepth, 2)}`,
  };
}

// Curl: "L 3 / 5 · R 3 / 5" and "Height L 85% · R 0%" (a hidden arm shows "–").
function curlPanelContent(overlayState: CurlOverlayState): PanelContent {
  const describeCount = (armState: CurlArmOverlayState): string =>
    armState === null ? "–" : `${armState.completedRepCount} / ${armState.totalRepCount}`;
  const describeHeight = (armState: CurlArmOverlayState): string =>
    armState?.currentHeightPercent == null ? "–" : `${Math.round(armState.currentHeightPercent)}%`;
  const { left, right } = overlayState.arms;
  return {
    counterText: `L ${describeCount(left)} · R ${describeCount(right)}`,
    meter: null,
    detailText: `Height L ${describeHeight(left)} · R ${describeHeight(right)}`,
  };
}

// ---- Panel: counter, optional meter, detail line ----

function drawPanel(context: CanvasRenderingContext2D, content: PanelContent, layout: OverlayLayout): number {
  const { unit, margin, padding, gap } = layout;
  const tickLabelGap = 1.5 * unit;

  // Measure the text to size the panel around its widest line.
  setFont(context, layout.counterFontSize, 700);
  const counterWidth = context.measureText(content.counterText).width;
  setFont(context, layout.labelFontSize, 500);
  const detailTextWidth = layout.showDetailText ? context.measureText(content.detailText).width : 0;
  const meterRowWidth =
    content.meter === null ? 0 : layout.meterWidth + tickLabelGap + context.measureText(content.meter.tickLabel).width;
  const panelWidth = 2 * padding + Math.max(counterWidth, detailTextWidth, meterRowWidth);

  // Background.
  context.fillStyle = OVERLAY_COLORS.panelBackground;
  context.beginPath();
  context.roundRect(margin, margin, panelWidth, layout.panelHeight, layout.cornerRadius);
  context.fill();

  // Rep counter.
  const contentX = margin + padding;
  let cursorY = margin + padding;
  context.textBaseline = "top";
  context.fillStyle = OVERLAY_COLORS.text;
  setFont(context, layout.counterFontSize, 700);
  context.fillText(content.counterText, contentX, cursorY);
  cursorY += layout.counterFontSize + gap;

  // Meter: track, accent fill from the bottom, labelled tick.
  if (content.meter !== null) {
    const meterTop = cursorY;
    const meterBottom = meterTop + layout.meterHeight;
    const meterRadius = layout.meterWidth / 2;
    context.fillStyle = OVERLAY_COLORS.meterTrack;
    context.beginPath();
    context.roundRect(contentX, meterTop, layout.meterWidth, layout.meterHeight, meterRadius);
    context.fill();

    const fillHeight = content.meter.fillFraction * layout.meterHeight;
    if (fillHeight > 0) {
      context.fillStyle = OVERLAY_COLORS.meterFill;
      context.beginPath();
      context.roundRect(
        contentX,
        meterBottom - fillHeight,
        layout.meterWidth,
        fillHeight,
        Math.min(meterRadius, fillHeight / 2),
      );
      context.fill();
    }

    const tickY = meterBottom - content.meter.tickFraction * layout.meterHeight;
    context.strokeStyle = OVERLAY_COLORS.tick;
    context.lineWidth = Math.max(1, 0.5 * unit);
    context.beginPath();
    context.moveTo(contentX - 0.8 * unit, tickY);
    context.lineTo(contentX + layout.meterWidth + 0.8 * unit, tickY);
    context.stroke();

    setFont(context, layout.labelFontSize, 500);
    context.fillStyle = OVERLAY_COLORS.mutedText;
    context.textBaseline = "middle";
    context.fillText(content.meter.tickLabel, contentX + layout.meterWidth + tickLabelGap, tickY);
    cursorY = meterBottom + gap;
  }

  // Detail line (dropped on very small players to keep the panel short).
  if (layout.showDetailText) {
    setFont(context, layout.labelFontSize, 500);
    context.textBaseline = "top";
    context.fillStyle = OVERLAY_COLORS.text;
    context.fillText(content.detailText, contentX, cursorY);
  }

  return margin + layout.panelHeight;
}

// ---- Grade pop-ups: one row of colored badges under the panel ----

function drawBadge(
  context: CanvasRenderingContext2D,
  badge: PopupBadge,
  badgeX: number,
  badgeY: number,
  layout: OverlayLayout,
): number {
  const shortText = getShortFeedbackText(badge.feedback);
  const badgeText = badge.armLabel === null ? shortText : `${badge.armLabel} ${shortText}`;
  setFont(context, layout.badgeFontSize, 600);
  const badgeWidth = context.measureText(badgeText).width + 2 * layout.badgePaddingX;

  context.fillStyle = FEEDBACK_TONE_COLORS[getFeedbackTone(badge.feedback.code)];
  context.beginPath();
  context.roundRect(badgeX, badgeY, badgeWidth, layout.badgeHeight, layout.badgeHeight / 2);
  context.fill();

  context.fillStyle = OVERLAY_COLORS.badgeText;
  context.textBaseline = "middle";
  context.fillText(badgeText, badgeX + layout.badgePaddingX, badgeY + layout.badgeHeight / 2);
  return badgeWidth;
}

function drawGradePopups(
  context: CanvasRenderingContext2D,
  gradePopups: GradePopup[],
  layout: OverlayLayout,
  panelBottom: number,
): void {
  const badgeY = panelBottom + layout.gap;
  let badgeX = layout.margin;
  for (const gradePopup of gradePopups) {
    if (gradePopup.opacity <= 0) continue;
    // Each pop-up fades on its own (e.g. the left arm's curl fades while the right arm's appears).
    context.globalAlpha = gradePopup.opacity;
    for (const badge of gradePopup.badges) {
      badgeX += drawBadge(context, badge, badgeX, badgeY, layout) + layout.gap;
    }
  }
  context.globalAlpha = 1;
}

// Draws the overlay (panel + pop-ups) on top of whatever is already on the canvas.
// devicePixelRatio = canvas pixels per displayed CSS pixel: the layout is sized for the size the
// video is shown at (readable on a phone), then drawn at full canvas resolution (sharp).
// For a video export, pass the video size as the canvas size and 1.
export function drawOverlay(
  context: CanvasRenderingContext2D,
  overlayState: OverlayState,
  canvasWidth: number,
  canvasHeight: number,
  devicePixelRatio: number = 1,
): void {
  const isSquat = overlayState.exercise === "squat";
  const panelContent = isSquat ? squatPanelContent(overlayState) : curlPanelContent(overlayState);
  const layout = computeOverlayLayout(
    canvasWidth / devicePixelRatio,
    canvasHeight / devicePixelRatio,
    devicePixelRatio,
    isSquat ? SQUAT_PANEL_SHAPE : CURL_PANEL_SHAPE,
  );
  context.save();
  const panelBottom = drawPanel(context, panelContent, layout);
  drawGradePopups(context, overlayState.gradePopups, layout, panelBottom);
  context.restore();
}

// ---- Skeleton tint ----

// Line color per connection: the tint covering it (its feedback tone color), else the default.
function skeletonLineColor(skeletonTints: SkeletonTint[]): (startIndex: number, endIndex: number) => string {
  return (startIndex, endIndex) => {
    const matchingTint = skeletonTints.find(
      (skeletonTint) =>
        skeletonTint.connections === "all" ||
        skeletonTint.connections.some(
          ([tintStart, tintEnd]) =>
            (tintStart === startIndex && tintEnd === endIndex) || (tintStart === endIndex && tintEnd === startIndex),
        ),
    );
    return matchingTint ? FEEDBACK_TONE_COLORS[getFeedbackTone(matchingTint.feedbackCode)] : SKELETON_LINE_COLOR;
  };
}

// ---- Full replay frame ----

type RenderReplayFrameOptions = {
  recording: PoseRecording;
  // Null/undefined: skeleton only.
  analysis: AnalysisResult | null | undefined;
  timeSeconds: number;
  showOverlay: boolean;
  // The canvas covers exactly the displayed video picture.
  canvasWidth: number;
  canvasHeight: number;
  // Canvas pixels per CSS pixel (window.devicePixelRatio in the browser, 1 for an export).
  devicePixelRatio: number;
};

// Clears the canvas and draws everything for this video time: the skeleton (tinted by the
// active rep's grade when the overlay is on: whole body for squats, the curling arm for curls)
// and the coaching overlay.
export function renderReplayFrame(
  context: CanvasRenderingContext2D,
  {
    recording,
    analysis,
    timeSeconds,
    showOverlay,
    canvasWidth,
    canvasHeight,
    devicePixelRatio,
  }: RenderReplayFrameOptions,
): void {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const overlayState = showOverlay && analysis ? computeOverlayState(analysis, timeSeconds) : null;

  const nearestFrame = findNearestFrame(recording.frames, timeSeconds * 1000);
  if (nearestFrame?.landmarks) {
    const lineColor = skeletonLineColor(overlayState?.skeletonTints ?? []);
    drawSkeleton(context, nearestFrame.landmarks, canvasWidth, canvasHeight, lineColor);
  }

  if (overlayState !== null) {
    drawOverlay(context, overlayState, canvasWidth, canvasHeight, devicePixelRatio);
  }
}
