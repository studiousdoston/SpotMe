// Mirrors server/schemas.py (camelCase JSON). Keep both in sync.

import type { PoseFrame } from "@/types/pose";

// Every exercise the app knows about, and the ones the server can analyze today.
export type ExerciseId = "squat" | "curl" | "push_up";
export type AnalyzableExercise = "squat" | "curl";

// Feedback codes the server sends (server/analysis/squat.py and curl.py).
export type DepthFeedbackCode = "good_depth" | "almost_depth" | "too_shallow";
export type TempoFeedbackCode = "controlled" | "dropping_too_fast" | "too_fast";
export type RangeFeedbackCode = "full_curl" | "partial_curl";

// A stable code (for styling) plus human-readable text.
export type Feedback<Code extends string = string> = {
  code: Code;
  text: string;
};

// ---- Request: POST /api/analyze ----

export type AnalyzeRequest = {
  exercise: AnalyzableExercise;
  frames: PoseFrame[];
  videoWidth: number;
  videoHeight: number;
  // null when the browser reports an unknown/infinite duration.
  durationSeconds: number | null;
};

// ---- Response: shared ----

// A smoothed signal over time (squat depth, elbow angle); null = no value at that time.
export type TimeSeries = {
  timesSeconds: number[];
  values: (number | null)[];
};

// ---- Response: squat ----

export type SquatRepResult = {
  repNumber: number;
  startSeconds: number;
  bottomSeconds: number;
  endSeconds: number;
  bottomDepth: number;
  depthFeedback: Feedback<DepthFeedbackCode>;
  downSeconds: number;
  upSeconds: number;
  tempoFeedback: Feedback<TempoFeedbackCode>;
};

export type SquatAnalysisResult = {
  exercise: "squat";
  // incomplete_recording: part of the video has no frames, so the set wasn't counted.
  status: "ok" | "low_visibility" | "incomplete_recording";
  message: string;
  repCount: number;
  trustedFraction: number;
  fps: number;
  reps: SquatRepResult[];
  // null when the set wasn't counted (low visibility or an incomplete recording).
  depthSignal: TimeSeries | null;
};

// ---- Response: curl (each arm counted separately) ----

export type ArmSide = "left" | "right";

export type CurlRepResult = {
  repNumber: number;
  startSeconds: number;
  // Moment the wrist was highest (top of the curl).
  peakSeconds: number;
  endSeconds: number;
  // How far the wrist rose: 0 = arm hanging, 100 = wrist at shoulder level (>= 70 = full curl).
  curlHeightPercent: number;
  rangeFeedback: Feedback<RangeFeedbackCode>;
};

export type CurlArmResult = {
  // False when the elbow/wrist were too hidden to count this arm.
  visible: boolean;
  // null = not counted (hidden arm, or the set wasn't counted). 0 = counted, no curls found.
  repCount: number | null;
  reps: CurlRepResult[];
  // Smoothed wrist height in upper-arm lengths: 0 = shoulder level, about -1.8 = hanging
  // (null when this arm wasn't counted).
  wristHeightSignal: TimeSeries | null;
  // This arm's hanging wrist height (= 0% curl height). null when not counted.
  hangingBaseline: number | null;
};

export type CurlAnalysisResult = {
  exercise: "curl";
  status: "ok" | "low_visibility" | "not_front_view" | "incomplete_recording";
  message: string;
  // Non-blocking advice; the counts are still shown.
  warnings: string[];
  // 0° = facing the camera, 90° = side on. null when the shoulders were never visible.
  bodyTurnAngle: number | null;
  fps: number;
  arms: Record<ArmSide, CurlArmResult>;
};

// One result type per exercise; narrow with `analysis.exercise`.
export type AnalysisResult = SquatAnalysisResult | CurlAnalysisResult;

// FastAPI's 422 body: { detail: [{ loc: [...], msg: "..." }, ...] }
export type ValidationErrorItem = {
  loc: (string | number)[];
  msg: string;
};
