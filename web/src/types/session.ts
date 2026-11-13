import type { AnalysisResult, ExerciseId } from "@/types/analysis";
import type { PoseExtractionStats, PoseRecording } from "@/types/pose";

// A local video the browser has confirmed it can decode.
export type SelectedVideo = {
  fileName: string;
  // blob: URL owned by the workout session (revoked when a new session starts).
  videoUrl: string;
  videoWidth: number;
  videoHeight: number;
  durationSeconds: number;
};

// Everything about the set currently being analyzed, shared between Upload and Results.
export type WorkoutSession = {
  exercise: ExerciseId;
  video: SelectedVideo | null;
  recording: PoseRecording | null;
  extractionStats: PoseExtractionStats | null;
  analysis: AnalysisResult | null;
};
