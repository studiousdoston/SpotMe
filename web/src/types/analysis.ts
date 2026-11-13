// Mirrors server/schemas.py (camelCase JSON). Keep both in sync.

import type { PoseFrame } from "@/types/pose";

// Every exercise the app knows about, and the ones the server can analyze today.
export type ExerciseId = "squat" | "bicep_curl" | "push_up";
export type AnalyzableExercise = "squat";

// Feedback codes the server sends (server/analysis/squat.py).
export type DepthFeedbackCode = "good_depth" | "almost_depth" | "too_shallow";
export type TempoFeedbackCode = "controlled" | "dropping_too_fast" | "too_fast";

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

// ---- Response ----

export type RepResult = {
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

export type DepthSignal = {
  timesSeconds: number[];
  values: (number | null)[];
};

export type AnalysisResult = {
  exercise: AnalyzableExercise;
  status: "ok" | "low_visibility";
  message: string;
  repCount: number;
  trustedFraction: number;
  fps: number;
  reps: RepResult[];
  // null when visibility was too low to compute a trustworthy curve.
  depthSignal: DepthSignal | null;
};

// FastAPI's 422 body: { detail: [{ loc: [...], msg: "..." }, ...] }
export type ValidationErrorItem = {
  loc: (string | number)[];
  msg: string;
};
