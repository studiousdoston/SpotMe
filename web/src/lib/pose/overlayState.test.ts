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
import { fitContain } from "../video/fitContain.ts";

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

// Displayed sizes (CSS px) of the picture inside the player, from fitContain:
// phone = 390 px wide screen → 358 × 591 px player box (16 px side padding, 70vh of 844);
// desktop = 768 px column → 736 × 630 px player box (70vh of 900).
const PHONE_BOX = { width: 358, height: 591 };
const DESKTOP_BOX = { width: 736, height: 630 };
const PORTRAIT_VIDEO = { width: 464, height: 848 };
const LANDSCAPE_VIDEO = { width: 1920, height: 1080 };

function displayedSize(box: { width: number; height: number }, video: { width: number; height: number }) {
  const rect = fitContain(box.width, box.height, video.width, video.height);
  return { width: rect.width, height: rect.height };
}

describe("layout is sized from the displayed video, not its resolution", () => {
  const displayCases = [
    { name: "portrait video on a phone", display: displayedSize(PHONE_BOX, PORTRAIT_VIDEO), showsDepthText: true },
    { name: "landscape video on a phone", display: displayedSize(PHONE_BOX, LANDSCAPE_VIDEO), showsDepthText: false },
    { name: "portrait video on desktop", display: displayedSize(DESKTOP_BOX, PORTRAIT_VIDEO), showsDepthText: true },
    { name: "landscape video on desktop", display: displayedSize(DESKTOP_BOX, LANDSCAPE_VIDEO), showsDepthText: true },
  ];

  for (const displayCase of displayCases) {
    test(`${displayCase.name}: readable minimums and panel within 40% of the displayed height`, () => {
      const layout = computeOverlayLayout(displayCase.display.width, displayCase.display.height, 1);
      assert.ok(layout.counterFontSize >= 18, `counter ${layout.counterFontSize}px`);
      assert.ok(layout.labelFontSize >= 12, `labels ${layout.labelFontSize}px`);
      assert.ok(layout.badgeFontSize >= 12, `badges ${layout.badgeFontSize}px`);
      assert.ok(
        layout.panelHeight <= 0.4 * displayCase.display.height + 1e-9,
        `panel ${layout.panelHeight}px of ${displayCase.display.height}px`,
      );
      assert.equal(layout.showDepthText, displayCase.showsDepthText);
    });
  }

  test("very small player: readability wins (text minimums kept, depth line dropped, meter shrunk)", () => {
    const layout = computeOverlayLayout(200, 112, 1);
    assert.equal(layout.counterFontSize, 18);
    assert.equal(layout.labelFontSize, 12);
    assert.equal(layout.showDepthText, false);
    assert.equal(layout.meterHeight, 6 * layout.unit);
    // Taller than 40% here is accepted: text size takes priority.
    assert.ok(layout.panelHeight > 0.4 * 112);
  });

  test("large player: sizes grow with the displayed short side (1% unit)", () => {
    const layout = computeOverlayLayout(1600, 900, 1);
    assert.equal(layout.unit, 9);
    assert.equal(layout.counterFontSize, 54);
    assert.equal(layout.showDepthText, true);
    assert.ok(overlayTotalHeight(layout) <= 0.45 * 900);
  });

  test("devicePixelRatio scales canvas pixels but not the layout decisions", () => {
    const layoutAt1x = computeOverlayLayout(358, 201, 1);
    const layoutAt3x = computeOverlayLayout(358, 201, 3);
    assert.equal(layoutAt3x.showDepthText, layoutAt1x.showDepthText);
    assert.ok(Math.abs(layoutAt3x.counterFontSize - 3 * layoutAt1x.counterFontSize) < 1e-9);
    assert.ok(Math.abs(layoutAt3x.panelHeight - 3 * layoutAt1x.panelHeight) < 1e-9);
  });
});
