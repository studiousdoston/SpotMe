// Unit tests for the pure overlay logic. Run with: npm test (Node's built-in test runner).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AnalysisResult, RepResult } from "@/types/analysis";
import {
  computeOverlayLayout,
  computeOverlayState,
  countCompletedReps,
  findActiveRep,
  findGradePopup,
  interpolateDepth,
  meterFillFraction,
  overlayTotalHeight,
} from "./overlayState.ts";

// Builds a rep with good grades at the given times.
function makeRep(repNumber: number, startSeconds: number, bottomSeconds: number, endSeconds: number): RepResult {
  return {
    repNumber,
    startSeconds,
    bottomSeconds,
    endSeconds,
    bottomDepth: 0.95,
    depthFeedback: { code: "good_depth", text: "Good depth" },
    downSeconds: bottomSeconds - startSeconds,
    upSeconds: endSeconds - bottomSeconds,
    tempoFeedback: { code: "controlled", text: "Controlled" },
  };
}

// Six reps, 2.3 s apart (like the squat-front fixture): rep N = [1 + 2.3(N-1), +1] with bottom at +0.5.
const SIX_REPS = Array.from({ length: 6 }, (_, repIndex) => {
  const startSeconds = 1 + 2.3 * repIndex;
  return makeRep(repIndex + 1, startSeconds, startSeconds + 0.5, startSeconds + 1);
});

const ANALYSIS: AnalysisResult = {
  exercise: "squat",
  status: "ok",
  message: "6 squats counted",
  repCount: 6,
  trustedFraction: 1,
  fps: 30,
  reps: SIX_REPS,
  depthSignal: { timesSeconds: [0, 1, 2, 3], values: [0, 0.5, 1, null] },
};

describe("rep counting at a time", () => {
  test("a rep counts once the playhead passes its bottom", () => {
    assert.equal(countCompletedReps(SIX_REPS, 0), 0);
    assert.equal(countCompletedReps(SIX_REPS, 1.49), 0);
    assert.equal(countCompletedReps(SIX_REPS, 1.5), 1);
    assert.equal(countCompletedReps(SIX_REPS, 100), 6);
  });

  test("seeking to the middle of rep 4 (before its bottom) shows 3 completed", () => {
    const rep4 = SIX_REPS[3];
    const middleBeforeBottom = (rep4.startSeconds + rep4.bottomSeconds) / 2;
    assert.equal(countCompletedReps(SIX_REPS, middleBeforeBottom), 3);
    assert.equal(findActiveRep(SIX_REPS, middleBeforeBottom)?.repNumber, 4);
  });

  test("active rep window is [start, end)", () => {
    assert.equal(findActiveRep(SIX_REPS, 0.99), null);
    assert.equal(findActiveRep(SIX_REPS, 1)?.repNumber, 1);
    assert.equal(findActiveRep(SIX_REPS, 1.99)?.repNumber, 1);
    assert.equal(findActiveRep(SIX_REPS, 2), null);
  });
});

describe("grade pop-up", () => {
  test("shows for 2 s after a rep ends, fading during the last 0.5 s", () => {
    assert.equal(findGradePopup(SIX_REPS, 1.99), null);
    assert.equal(findGradePopup(SIX_REPS, 2)?.repNumber, 1);
    assert.equal(findGradePopup(SIX_REPS, 2)?.opacity, 1);
    assert.equal(findGradePopup(SIX_REPS, 3.25)?.opacity, 1);
    assert.ok(Math.abs((findGradePopup(SIX_REPS, 3.75)?.opacity ?? -1) - 0.5) < 1e-9);
    assert.equal(findGradePopup(SIX_REPS, 4), null);
  });

  test("shows the latest finished rep", () => {
    // Rep 2 ends at 4.3; at 4.5 rep 1's pop-up has expired, rep 2's is showing.
    assert.equal(findGradePopup(SIX_REPS, 4.5)?.repNumber, 2);
  });
});

describe("depth interpolation", () => {
  const depthSignal = ANALYSIS.depthSignal!;

  test("interpolates linearly between samples", () => {
    assert.equal(interpolateDepth(depthSignal, 0.5), 0.25);
    assert.equal(interpolateDepth(depthSignal, 1.5), 0.75);
  });

  test("clamps outside the signal and skips missing samples", () => {
    assert.equal(interpolateDepth(depthSignal, -1), 0);
    assert.equal(interpolateDepth(depthSignal, 2.5), 1);
    assert.equal(interpolateDepth({ timesSeconds: [], values: [] }, 1), null);
  });

  test("meter fill is clamped to 0–1", () => {
    assert.equal(meterFillFraction(-0.2), 0);
    assert.equal(meterFillFraction(0.6), 0.5);
    assert.equal(meterFillFraction(5), 1);
  });
});

describe("overlay state", () => {
  test("combines counter, active rep and skeleton tint", () => {
    const overlayState = computeOverlayState(ANALYSIS, 1.2);
    assert.ok(overlayState !== null);
    assert.equal(overlayState.completedRepCount, 0);
    assert.equal(overlayState.totalRepCount, 6);
    assert.equal(overlayState.activeRep?.repNumber, 1);
    assert.equal(overlayState.skeletonFeedbackCode, "good_depth");
    assert.equal(computeOverlayState(ANALYSIS, 0.5)?.skeletonFeedbackCode, null);
  });

  test("no overlay for a low-visibility result", () => {
    const lowVisibility: AnalysisResult = { ...ANALYSIS, status: "low_visibility", reps: [], depthSignal: null };
    assert.equal(computeOverlayState(lowVisibility, 1), null);
  });
});

describe("layout scales with the canvas, portrait and landscape", () => {
  const canvasSizes = [
    { name: "portrait phone (fixture)", width: 464, height: 848 },
    { name: "portrait 1080p", width: 1080, height: 1920 },
    { name: "landscape 1080p", width: 1920, height: 1080 },
    { name: "landscape 360p", width: 640, height: 360 },
    { name: "square", width: 720, height: 720 },
  ];

  for (const canvasSize of canvasSizes) {
    test(`${canvasSize.name}: sizes are fractions of the short side and everything fits`, () => {
      const layout = computeOverlayLayout(canvasSize.width, canvasSize.height);
      const shortSide = Math.min(canvasSize.width, canvasSize.height);
      assert.equal(layout.unit, shortSide / 100);
      assert.ok(Math.abs(layout.counterFontSize / shortSide - 0.06) < 1e-9);
      // Panel + pop-up stay in the top part of the frame, leaving the body visible.
      assert.ok(overlayTotalHeight(layout) <= 0.45 * canvasSize.height);
      assert.ok(layout.panelHeight <= 0.35 * canvasSize.height);
    });
  }

  test("rotating the video keeps the same overlay size", () => {
    assert.deepEqual(computeOverlayLayout(464, 848), computeOverlayLayout(848, 464));
  });
});
