// Unit tests for the pure overlay logic. Run with: npm test (Node's built-in test runner).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CurlAnalysisResult, CurlRepResult, SquatAnalysisResult, SquatRepResult } from "@/types/analysis";
import {
  ARM_CONNECTIONS,
  computeOverlayLayout,
  computeOverlayState,
  countCompletedReps,
  curlHeightPercent,
  CURL_PANEL_SHAPE,
  findActiveRep,
  findRecentlyFinishedRep,
  interpolateSignal,
  meterFillFraction,
  overlayTotalHeight,
} from "./overlayState.ts";
import { fitContain } from "../video/fitContain.ts";

// Builds a rep with good grades at the given times.
function makeRep(repNumber: number, startSeconds: number, bottomSeconds: number, endSeconds: number): SquatRepResult {
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

const ANALYSIS: SquatAnalysisResult = {
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
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 1.99), null);
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 2)?.rep.repNumber, 1);
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 2)?.opacity, 1);
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 3.25)?.opacity, 1);
    assert.ok(Math.abs((findRecentlyFinishedRep(SIX_REPS, 3.75)?.opacity ?? -1) - 0.5) < 1e-9);
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 4), null);
  });

  test("shows the latest finished rep", () => {
    // Rep 2 ends at 4.3; at 4.5 rep 1's pop-up has expired, rep 2's is showing.
    assert.equal(findRecentlyFinishedRep(SIX_REPS, 4.5)?.rep.repNumber, 2);
  });
});

describe("depth interpolation", () => {
  const depthSignal = ANALYSIS.depthSignal!;

  test("interpolates linearly between samples", () => {
    assert.equal(interpolateSignal(depthSignal, 0.5), 0.25);
    assert.equal(interpolateSignal(depthSignal, 1.5), 0.75);
  });

  test("clamps outside the signal and skips missing samples", () => {
    assert.equal(interpolateSignal(depthSignal, -1), 0);
    assert.equal(interpolateSignal(depthSignal, 2.5), 1);
    assert.equal(interpolateSignal({ timesSeconds: [], values: [] }, 1), null);
  });

  test("meter fill is clamped to 0–1", () => {
    assert.equal(meterFillFraction(-0.2), 0);
    assert.equal(meterFillFraction(0.6), 0.5);
    assert.equal(meterFillFraction(5), 1);
  });
});

describe("squat overlay state", () => {
  test("combines counter, active rep and skeleton tint", () => {
    const overlayState = computeOverlayState(ANALYSIS, 1.2);
    assert.ok(overlayState !== null && overlayState.exercise === "squat");
    assert.equal(overlayState.completedRepCount, 0);
    assert.equal(overlayState.totalRepCount, 6);
    assert.equal(overlayState.activeRep?.repNumber, 1);
    assert.deepEqual(overlayState.skeletonTints, [{ connections: "all", feedbackCode: "good_depth" }]);
    assert.deepEqual(computeOverlayState(ANALYSIS, 0.5)?.skeletonTints, []);
  });

  test("grade pop-up shows depth + tempo badges after a rep", () => {
    const gradePopups = computeOverlayState(ANALYSIS, 2.1)?.gradePopups;
    assert.equal(gradePopups?.length, 1);
    assert.deepEqual(
      gradePopups?.[0].badges.map((badge) => badge.feedback.code),
      ["good_depth", "controlled"],
    );
  });

  test("no overlay for a low-visibility result", () => {
    const lowVisibility: SquatAnalysisResult = { ...ANALYSIS, status: "low_visibility", reps: [], depthSignal: null };
    assert.equal(computeOverlayState(lowVisibility, 1), null);
  });
});

// Builds a curl at the given times with a full/partial grade from its curl height (>= 70% = full).
function makeCurl(repNumber: number, startSeconds: number, curlHeightPercent: number): CurlRepResult {
  const isFull = curlHeightPercent >= 70;
  return {
    repNumber,
    startSeconds,
    peakSeconds: startSeconds + 0.5,
    endSeconds: startSeconds + 1,
    curlHeightPercent,
    rangeFeedback: isFull
      ? { code: "full_curl", text: "Full curl" }
      : { code: "partial_curl", text: "Partial curl, squeeze all the way up" },
  };
}

// Alternating: left curls at 0, 3 s; right curls at 1.5 s (partial), 4.5 s.
const CURL_ANALYSIS: CurlAnalysisResult = {
  exercise: "curl",
  status: "ok",
  message: "Left 2 · Right 2",
  warnings: [],
  bodyTurnAngle: 10,
  fps: 30,
  arms: {
    left: {
      visible: true,
      repCount: 2,
      reps: [makeCurl(1, 0, 100), makeCurl(2, 3, 95)],
      // Hanging at -2 upper-arm lengths, up to shoulder level (0) at 0.5 s.
      wristHeightSignal: { timesSeconds: [0, 0.5, 1], values: [-2, 0, -2] },
      hangingBaseline: -2,
    },
    right: {
      visible: true,
      repCount: 2,
      reps: [makeCurl(1, 1.5, 40), makeCurl(2, 4.5, 90)],
      wristHeightSignal: { timesSeconds: [0, 0.5, 1], values: [-2, -2, -2] },
      hangingBaseline: -2,
    },
  },
};

describe("curl overlay state", () => {
  test("counts each arm separately, once past the top of the curl", () => {
    const overlayState = computeOverlayState(CURL_ANALYSIS, 3.6);
    assert.ok(overlayState !== null && overlayState.exercise === "curl");
    assert.equal(overlayState.arms.left?.completedRepCount, 2);
    assert.equal(overlayState.arms.left?.totalRepCount, 2);
    assert.equal(overlayState.arms.right?.completedRepCount, 1);
  });

  test("live curl height % per arm", () => {
    const overlayState = computeOverlayState(CURL_ANALYSIS, 0.25);
    assert.ok(overlayState !== null && overlayState.exercise === "curl");
    // Half way from hanging (-2) to the shoulder (0) = 50%.
    assert.equal(overlayState.arms.left?.currentHeightPercent, 50);
    assert.equal(overlayState.arms.right?.currentHeightPercent, 0);
  });

  test("curl height % is relative to the arm's hanging baseline, clamped to 0–100", () => {
    assert.equal(curlHeightPercent(-0.9, -1.8), 50);
    assert.equal(curlHeightPercent(0.3, -1.8), 100);
    assert.equal(curlHeightPercent(-2.2, -1.8), 0);
  });

  test("tints only the curling arm, in the curl's grade", () => {
    const leftCurling = computeOverlayState(CURL_ANALYSIS, 0.2);
    assert.deepEqual(leftCurling?.skeletonTints, [{ connections: ARM_CONNECTIONS.left, feedbackCode: "full_curl" }]);
    const rightCurling = computeOverlayState(CURL_ANALYSIS, 1.7);
    assert.deepEqual(rightCurling?.skeletonTints, [
      { connections: ARM_CONNECTIONS.right, feedbackCode: "partial_curl" },
    ]);
  });

  test("Full/Partial pop-up with the arm label after each curl", () => {
    // Left curl 1 ended at 1 s; right curl 1 (partial) ended at 2.5 s.
    const afterLeft = computeOverlayState(CURL_ANALYSIS, 1.2)?.gradePopups;
    assert.deepEqual(
      afterLeft?.map((gradePopup) => gradePopup.badges[0]),
      [{ feedback: { code: "full_curl", text: "Full curl" }, armLabel: "L" }],
    );
    // At 2.6 s both pop-ups are up (left's fading, right's fresh): left first, then right.
    const bothArms = computeOverlayState(CURL_ANALYSIS, 2.6)?.gradePopups;
    assert.deepEqual(
      bothArms?.map((gradePopup) => [gradePopup.badges[0].armLabel, gradePopup.badges[0].feedback.code]),
      [
        ["L", "full_curl"],
        ["R", "partial_curl"],
      ],
    );
  });

  test("a hidden arm has no overlay state", () => {
    const hiddenRight: CurlAnalysisResult = {
      ...CURL_ANALYSIS,
      arms: {
        ...CURL_ANALYSIS.arms,
        right: { visible: false, repCount: null, reps: [], wristHeightSignal: null, hangingBaseline: null },
      },
    };
    const overlayState = computeOverlayState(hiddenRight, 1);
    assert.ok(overlayState !== null && overlayState.exercise === "curl");
    assert.equal(overlayState.arms.right, null);
    assert.notEqual(overlayState.arms.left, null);
  });

  test("no overlay for an incomplete recording", () => {
    const incomplete: CurlAnalysisResult = { ...CURL_ANALYSIS, status: "incomplete_recording" };
    assert.equal(computeOverlayState(incomplete, 1), null);
  });

  test("no overlay when not filmed from the front", () => {
    const notFront: CurlAnalysisResult = { ...CURL_ANALYSIS, status: "not_front_view" };
    assert.equal(computeOverlayState(notFront, 1), null);
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
    { name: "portrait video on a phone", display: displayedSize(PHONE_BOX, PORTRAIT_VIDEO), showsDetailText: true },
    { name: "landscape video on a phone", display: displayedSize(PHONE_BOX, LANDSCAPE_VIDEO), showsDetailText: false },
    { name: "portrait video on desktop", display: displayedSize(DESKTOP_BOX, PORTRAIT_VIDEO), showsDetailText: true },
    { name: "landscape video on desktop", display: displayedSize(DESKTOP_BOX, LANDSCAPE_VIDEO), showsDetailText: true },
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
      assert.equal(layout.showDetailText, displayCase.showsDetailText);
    });
  }

  test("very small player: readability wins (text minimums kept, depth line dropped, meter shrunk)", () => {
    const layout = computeOverlayLayout(200, 112, 1);
    assert.equal(layout.counterFontSize, 18);
    assert.equal(layout.labelFontSize, 12);
    assert.equal(layout.showDetailText, false);
    assert.equal(layout.meterHeight, 6 * layout.unit);
    // Taller than 40% here is accepted: text size takes priority.
    assert.ok(layout.panelHeight > 0.4 * 112);
  });

  test("large player: sizes grow with the displayed short side (1% unit)", () => {
    const layout = computeOverlayLayout(1600, 900, 1);
    assert.equal(layout.unit, 9);
    assert.equal(layout.counterFontSize, 54);
    assert.equal(layout.showDetailText, true);
    assert.ok(overlayTotalHeight(layout) <= 0.45 * 900);
  });

  test("devicePixelRatio scales canvas pixels but not the layout decisions", () => {
    const layoutAt1x = computeOverlayLayout(358, 201, 1);
    const layoutAt3x = computeOverlayLayout(358, 201, 3);
    assert.equal(layoutAt3x.showDetailText, layoutAt1x.showDetailText);
    assert.ok(Math.abs(layoutAt3x.counterFontSize - 3 * layoutAt1x.counterFontSize) < 1e-9);
    assert.ok(Math.abs(layoutAt3x.panelHeight - 3 * layoutAt1x.panelHeight) < 1e-9);
  });

  for (const displayCase of displayCases) {
    test(`curl panel (no meter), ${displayCase.name}: keeps the elbow-angle line and fits within 40%`, () => {
      const layout = computeOverlayLayout(displayCase.display.width, displayCase.display.height, 1, CURL_PANEL_SHAPE);
      assert.equal(layout.meterHeight, 0);
      assert.equal(layout.showDetailText, true);
      assert.ok(layout.panelHeight <= 0.4 * displayCase.display.height + 1e-9);
    });
  }
});
