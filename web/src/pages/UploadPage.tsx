import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { describeAnalyzeError, useAnalyzeRecordingMutation } from "@/api/analyze";
import { ExercisePicker } from "@/components/ExercisePicker";
import { PoseExtractionView } from "@/components/PoseExtractionView";
import { VideoPicker } from "@/components/VideoPicker";
import { usePoseLandmarker } from "@/hooks/usePoseLandmarker";
import { useVideoFile } from "@/hooks/useVideoFile";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { isAnalyzableExercise } from "@/lib/exercises";
import type { ExtractionResult } from "@/lib/pose/extractLandmarks";
import type { PoseRecording } from "@/types/pose";

// In-browser pose extraction for the current video.
type ExtractionState = { status: "idle" } | { status: "extracting" } | { status: "failed"; errorMessage: string };

// Pick exercise → pick video → pose detection in the browser → send landmarks to the server → /results.
export function UploadPage() {
  const navigate = useNavigate();
  const landmarkerState = usePoseLandmarker();
  const { videoFileState, openVideoFile } = useVideoFile();
  const { session, selectExercise, startSession, saveRecording, saveAnalysis, clearSession } = useWorkoutSession();
  const analyzeMutation = useAnalyzeRecordingMutation();
  const [extractionState, setExtractionState] = useState<ExtractionState>({ status: "idle" });

  const isBusy =
    videoFileState.status === "checking" || extractionState.status === "extracting" || analyzeMutation.isPending;

  // A new file starts a new session: drop the previous one (and its video URL), then check the file.
  async function handleVideoSelected(videoFile: File): Promise<void> {
    clearSession();
    analyzeMutation.reset();
    setExtractionState({ status: "idle" });
    const acceptedVideo = await openVideoFile(videoFile);
    if (acceptedVideo === null) return;
    startSession(acceptedVideo);
    setExtractionState({ status: "extracting" });
  }

  // Send the landmarks to the server; on success show the results.
  function sendForAnalysis(recording: PoseRecording): void {
    if (!isAnalyzableExercise(session.exercise)) return;
    analyzeMutation.mutate(
      { exercise: session.exercise, recording },
      {
        onSuccess: (analysis) => {
          saveAnalysis(analysis);
          void navigate("/results");
        },
      },
    );
  }

  function handleExtractionComplete(extractionResult: ExtractionResult): void {
    saveRecording(extractionResult.recording, extractionResult.stats);
    setExtractionState({ status: "idle" });
    sendForAnalysis(extractionResult.recording);
  }

  // Cancel: unmounting PoseExtractionView stops the run; then drop the session's video.
  function handleCancel(): void {
    setExtractionState({ status: "idle" });
    clearSession();
  }

  const hasPreviousResults = session.analysis !== null && !isBusy;

  return (
    <section className="space-y-6">
      {/* Intro + privacy note */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Upload or record a set</h1>
        <p className="text-neutral-400">
          Your video stays on this device. Only body points are sent for analysis.
        </p>
      </div>

      {hasPreviousResults && (
        <Link to="/results" className="block text-sm font-medium text-accent">
          View results for {session.video?.fileName ?? "your last set"} →
        </Link>
      )}

      {/* Model status */}
      {landmarkerState.status === "loading" && <p className="text-sm text-neutral-400">Loading pose model…</p>}
      {landmarkerState.status === "preparing" && (
        <p className="text-sm text-neutral-400">Preparing pose model…</p>
      )}
      {landmarkerState.status === "error" && (
        <p className="rounded-xl bg-red-950 p-3 text-sm text-red-200">{landmarkerState.errorMessage}</p>
      )}

      <ExercisePicker selectedExercise={session.exercise} onSelect={selectExercise} disabled={isBusy} />

      <VideoPicker onVideoSelected={(videoFile) => void handleVideoSelected(videoFile)} disabled={isBusy} />

      {/* File checks */}
      {videoFileState.status === "checking" && (
        <p className="text-sm text-neutral-400">Opening {videoFileState.fileName}…</p>
      )}
      {videoFileState.status === "unsupported" && (
        <p className="rounded-xl bg-red-950 p-3 text-sm text-red-200">
          This browser can't play <strong>{videoFileState.fileName}</strong>. iPhone HEVC (.MOV) videos often fail in
          Chrome. Try Safari, or export the video as H.264 MP4.
        </p>
      )}

      {/* Pose extraction: waits for the model, then runs while this view is mounted */}
      {session.video !== null && extractionState.status === "extracting" && (
        <>
          {(landmarkerState.status === "loading" || landmarkerState.status === "preparing") && (
            <p className="text-sm text-neutral-400">Waiting for the pose model to finish loading…</p>
          )}
          {landmarkerState.status === "ready" && (
            <PoseExtractionView
              key={session.video.videoUrl}
              videoUrl={session.video.videoUrl}
              poseLandmarker={landmarkerState.poseLandmarker}
              onComplete={handleExtractionComplete}
              onError={(errorMessage) => setExtractionState({ status: "failed", errorMessage })}
              onCancel={handleCancel}
            />
          )}
        </>
      )}

      {extractionState.status === "failed" && (
        <p className="rounded-xl bg-red-950 p-3 text-sm text-red-200">{extractionState.errorMessage}</p>
      )}

      {/* Server analysis */}
      {analyzeMutation.isPending && (
        <p role="status" className="rounded-xl bg-neutral-900 p-4 text-center text-neutral-200">
          Counting reps and grading your form…
        </p>
      )}
      {analyzeMutation.isError && (
        <div className="space-y-3 rounded-xl bg-red-950 p-4">
          <p className="text-sm text-red-200">{describeAnalyzeError(analyzeMutation.error)}</p>
          {session.recording !== null && (
            <button
              type="button"
              onClick={() => session.recording !== null && sendForAnalysis(session.recording)}
              className="h-11 w-full rounded-xl bg-red-200 font-medium text-red-950 active:brightness-90"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
