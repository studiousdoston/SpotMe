import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkoutSessionContext, type WorkoutSessionContextValue } from "@/lib/workoutSession/workoutSessionContext";
import type { AnalysisResult, ExerciseId } from "@/types/analysis";
import type { PoseExtractionStats, PoseRecording } from "@/types/pose";
import type { SelectedVideo, WorkoutSession } from "@/types/session";

const EMPTY_SESSION: WorkoutSession = {
  exercise: "squat",
  video: null,
  recording: null,
  extractionStats: null,
  analysis: null,
};

// Holds the current set (exercise, video, landmarks, analysis) above the router,
// so it survives navigating from Upload to Results.
// It also owns the video's blob: URL: revoked when a new session starts,
// the session is cleared, or the app unmounts — never on navigation.
export function WorkoutSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WorkoutSession>(EMPTY_SESSION);
  const ownedVideoUrlRef = useRef<string | null>(null);

  // Frees the session's blob URL, if any.
  const releaseOwnedVideoUrl = useCallback(() => {
    if (ownedVideoUrlRef.current !== null) {
      URL.revokeObjectURL(ownedVideoUrlRef.current);
      ownedVideoUrlRef.current = null;
    }
  }, []);

  // Revoke when the app unmounts.
  useEffect(() => releaseOwnedVideoUrl, [releaseOwnedVideoUrl]);

  const selectExercise = useCallback((exercise: ExerciseId) => {
    setSession((previousSession) => ({ ...previousSession, exercise }));
  }, []);

  const startSession = useCallback(
    (video: SelectedVideo) => {
      if (ownedVideoUrlRef.current !== video.videoUrl) releaseOwnedVideoUrl();
      ownedVideoUrlRef.current = video.videoUrl;
      setSession((previousSession) => ({ ...EMPTY_SESSION, exercise: previousSession.exercise, video }));
    },
    [releaseOwnedVideoUrl],
  );

  const saveRecording = useCallback((recording: PoseRecording, extractionStats: PoseExtractionStats) => {
    setSession((previousSession) => ({ ...previousSession, recording, extractionStats, analysis: null }));
  }, []);

  const saveAnalysis = useCallback((analysis: AnalysisResult) => {
    setSession((previousSession) => ({ ...previousSession, analysis }));
  }, []);

  const clearSession = useCallback(() => {
    releaseOwnedVideoUrl();
    setSession((previousSession) => ({ ...EMPTY_SESSION, exercise: previousSession.exercise }));
  }, [releaseOwnedVideoUrl]);

  // Stable value so consumers only re-render when the session itself changes.
  const contextValue = useMemo<WorkoutSessionContextValue>(
    () => ({ session, selectExercise, startSession, saveRecording, saveAnalysis, clearSession }),
    [session, selectExercise, startSession, saveRecording, saveAnalysis, clearSession],
  );

  return <WorkoutSessionContext value={contextValue}>{children}</WorkoutSessionContext>;
}
