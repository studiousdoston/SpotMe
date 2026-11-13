import { createContext } from "react";
import type { AnalysisResult, ExerciseId } from "@/types/analysis";
import type { PoseExtractionStats, PoseRecording } from "@/types/pose";
import type { SelectedVideo, WorkoutSession } from "@/types/session";

export type WorkoutSessionContextValue = {
  session: WorkoutSession;
  selectExercise: (exercise: ExerciseId) => void;
  // Starts a new set with this video. The session takes ownership of video.videoUrl
  // (and revokes the previous session's URL).
  startSession: (video: SelectedVideo) => void;
  saveRecording: (recording: PoseRecording, extractionStats: PoseExtractionStats) => void;
  saveAnalysis: (analysis: AnalysisResult) => void;
  // Drops the video, recording and analysis (keeps the chosen exercise).
  clearSession: () => void;
};

// Provided by WorkoutSessionProvider; read through useWorkoutSession().
export const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(null);
