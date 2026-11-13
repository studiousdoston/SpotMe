// Canvas drawing for the coaching overlay (broadcast-style panel + grade pop-up),
// and one entry point that renders a full replay frame (skeleton + overlay).
// Works on any 2D canvas, so it can be reused for live camera mode and video export.

import { FEEDBACK_TONE_COLORS, getFeedbackTone, getShortFeedbackText } from "@/lib/feedbackTone";
import { formatDepth } from "@/lib/formatDepth";
import { findNearestFrame } from "@/lib/pose/findNearestFrame";
import {
  computeOverlayLayout,
  computeOverlayState,
  meterFillFraction,
  type OverlayLayout,
  type OverlayState,
} from "@/lib/pose/overlayState";
import { drawSkeleton, SKELETON_LINE_COLOR } from "@/lib/pose/skeleton";
import type { AnalysisResult, Feedback } from "@/types/analysis";
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

// ---- Panel: rep counter, depth meter, depth value ----

function drawPanel(context: CanvasRenderingContext2D, overlayState: OverlayState, layout: OverlayLayout): number {
  const { unit, margin, padding, gap } = layout;
  const counterText = `Rep ${overlayState.completedRepCount} / ${overlayState.totalRepCount}`;
  const depthText = `Depth ${overlayState.currentDepth === null ? "–" : formatDepth(overlayState.currentDepth, 2)}`;
  const tickLabelText = "good";
  const tickLabelGap = 1.5 * unit;

  // Measure the text to size the panel around its widest line.
  setFont(context, layout.counterFontSize, 700);
  const counterWidth = context.measureText(counterText).width;
  setFont(context, layout.labelFontSize, 500);
  const depthTextWidth = context.measureText(depthText).width;
  const meterRowWidth = layout.meterWidth + tickLabelGap + context.measureText(tickLabelText).width;
  const panelWidth = 2 * padding + Math.max(counterWidth, depthTextWidth, meterRowWidth);

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
  context.fillText(counterText, contentX, cursorY);
  cursorY += layout.counterFontSize + gap;

  // Depth meter: track, accent fill from the bottom, tick at "good depth".
  const meterTop = cursorY;
  const meterBottom = meterTop + layout.meterHeight;
  const meterRadius = layout.meterWidth / 2;
  context.fillStyle = OVERLAY_COLORS.meterTrack;
  context.beginPath();
  context.roundRect(contentX, meterTop, layout.meterWidth, layout.meterHeight, meterRadius);
  context.fill();

  if (overlayState.currentDepth !== null) {
    const fillHeight = meterFillFraction(overlayState.currentDepth) * layout.meterHeight;
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
  }

  const tickY = meterBottom - meterFillFraction(GOOD_DEPTH_THRESHOLD) * layout.meterHeight;
  context.strokeStyle = OVERLAY_COLORS.tick;
  context.lineWidth = Math.max(1, 0.5 * unit);
  context.beginPath();
  context.moveTo(contentX - 0.8 * unit, tickY);
  context.lineTo(contentX + layout.meterWidth + 0.8 * unit, tickY);
  context.stroke();

  setFont(context, layout.labelFontSize, 500);
  context.fillStyle = OVERLAY_COLORS.mutedText;
  context.textBaseline = "middle";
  context.fillText(tickLabelText, contentX + layout.meterWidth + tickLabelGap, tickY);
  cursorY = meterBottom + gap;

  // Live depth value.
  context.textBaseline = "top";
  context.fillStyle = OVERLAY_COLORS.text;
  context.fillText(depthText, contentX, cursorY);

  return margin + layout.panelHeight;
}

// ---- Grade pop-up: two colored badges under the panel ----

function drawBadge(
  context: CanvasRenderingContext2D,
  feedback: Feedback,
  badgeX: number,
  badgeY: number,
  layout: OverlayLayout,
): number {
  const badgeText = getShortFeedbackText(feedback);
  setFont(context, layout.badgeFontSize, 600);
  const badgeWidth = context.measureText(badgeText).width + 2 * layout.badgePaddingX;

  context.fillStyle = FEEDBACK_TONE_COLORS[getFeedbackTone(feedback.code)];
  context.beginPath();
  context.roundRect(badgeX, badgeY, badgeWidth, layout.badgeHeight, layout.badgeHeight / 2);
  context.fill();

  context.fillStyle = OVERLAY_COLORS.badgeText;
  context.textBaseline = "middle";
  context.fillText(badgeText, badgeX + layout.badgePaddingX, badgeY + layout.badgeHeight / 2);
  return badgeWidth;
}

function drawGradePopup(
  context: CanvasRenderingContext2D,
  overlayState: OverlayState,
  layout: OverlayLayout,
  panelBottom: number,
): void {
  const gradePopup = overlayState.gradePopup;
  if (gradePopup === null || gradePopup.opacity <= 0) return;

  context.globalAlpha = gradePopup.opacity;
  const badgeY = panelBottom + layout.gap;
  const depthBadgeWidth = drawBadge(context, gradePopup.depthFeedback, layout.margin, badgeY, layout);
  drawBadge(context, gradePopup.tempoFeedback, layout.margin + depthBadgeWidth + layout.gap, badgeY, layout);
}

// Draws the overlay (panel + pop-up) on top of whatever is already on the canvas.
export function drawOverlay(
  context: CanvasRenderingContext2D,
  overlayState: OverlayState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const layout = computeOverlayLayout(canvasWidth, canvasHeight);
  context.save();
  const panelBottom = drawPanel(context, overlayState, layout);
  drawGradePopup(context, overlayState, layout, panelBottom);
  context.restore();
}

// ---- Full replay frame ----

type RenderReplayFrameOptions = {
  recording: PoseRecording;
  // Null/undefined: skeleton only.
  analysis: AnalysisResult | null | undefined;
  timeSeconds: number;
  showOverlay: boolean;
  canvasWidth: number;
  canvasHeight: number;
};

// Clears the canvas and draws everything for this video time: the skeleton (tinted by the
// active rep's depth grade when the overlay is on) and the coaching overlay.
export function renderReplayFrame(
  context: CanvasRenderingContext2D,
  { recording, analysis, timeSeconds, showOverlay, canvasWidth, canvasHeight }: RenderReplayFrameOptions,
): void {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const overlayState = showOverlay && analysis ? computeOverlayState(analysis, timeSeconds) : null;

  const nearestFrame = findNearestFrame(recording.frames, timeSeconds * 1000);
  if (nearestFrame?.landmarks) {
    const skeletonColor = overlayState?.skeletonFeedbackCode
      ? FEEDBACK_TONE_COLORS[getFeedbackTone(overlayState.skeletonFeedbackCode)]
      : SKELETON_LINE_COLOR;
    drawSkeleton(context, nearestFrame.landmarks, canvasWidth, canvasHeight, skeletonColor);
  }

  if (overlayState !== null) drawOverlay(context, overlayState, canvasWidth, canvasHeight);
}
