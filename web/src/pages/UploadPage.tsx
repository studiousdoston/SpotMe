import { useState } from "react";
import { PoseExtractionView } from "@/components/PoseExtractionView";
import { PoseReplayPlayer } from "@/components/PoseReplayPlayer";
import { RecordingSummary } from "@/components/RecordingSummary";
import { VideoPicker } from "@/components/VideoPicker";
import { usePoseLandmarker } from "@/hooks/usePoseLandmarker";
import { useVideoFile } from "@/hooks/useVideoFile";
import type { ExtractionResult } from "@/lib/pose/extractLandmarks";

// Where the current video is in the analysis flow.
type AnalysisState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "done"; extractionResult: ExtractionResult }
  | { status: "failed"; errorMessage: string };

// Pick a video → pose detection runs in the browser → replay with the skeleton on top.
export function UploadPage() {
  const landmarkerState = usePoseLandmarker();
  const { videoFileState, selectVideoFile, clearVideoFile } = useVideoFile();
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: "idle" });

  // New file: check it can be decoded, then start the analysis.
  async function handleVideoSelected(videoFile: File): Promise<void> {
    setAnalysisState({ status: "idle" });
    const isReadyToAnalyze = await selectVideoFile(videoFile);
    if (isReadyToAnalyze) setAnalysisState({ status: "processing" });
  }

  // Cancel: unmounting PoseExtractionView stops the run; then drop the video.
  function handleCancel(): void {
    setAnalysisState({ status: "idle" });
    clearVideoFile();
  }

  const selectedVideo = videoFileState.status === "ready" ? videoFileState.video : null;

  return (
    <section className="space-y-6">
      {/* Intro + privacy note */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Upload or record a set</h1>
        <p className="text-neutral-400">Your video stays on this device. Pose detection runs in your browser.</p>
      </div>

      {/* Model status */}
      {landmarkerState.status === "loading" && <p className="text-sm text-neutral-400">Loading pose model…</p>}
      {landmarkerState.status === "preparing" && (
        <p className="text-sm text-neutral-400">Preparing pose model…</p>
      )}
      {landmarkerState.status === "error" && (
        <p className="rounded-xl bg-red-950 p-3 text-sm text-red-200">{landmarkerState.errorMessage}</p>
      )}

      <VideoPicker
        onVideoSelected={(videoFile) => void handleVideoSelected(videoFile)}
        disabled={analysisState.status === "processing" || videoFileState.status === "checking"}
      />

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

      {/* Analysis: waits for the model, then runs while this view is mounted */}
      {selectedVideo !== null && analysisState.status === "processing" && (
        <>
          {(landmarkerState.status === "loading" || landmarkerState.status === "preparing") && (
            <p className="text-sm text-neutral-400">Waiting for the pose model to finish loading…</p>
          )}
          {landmarkerState.status === "ready" && (
            <PoseExtractionView
              key={selectedVideo.videoUrl}
              videoUrl={selectedVideo.videoUrl}
              poseLandmarker={landmarkerState.poseLandmarker}
              onComplete={(extractionResult) => setAnalysisState({ status: "done", extractionResult })}
              onError={(errorMessage) => setAnalysisState({ status: "failed", errorMessage })}
              onCancel={handleCancel}
            />
          )}
        </>
      )}

      {analysisState.status === "failed" && (
        <p className="rounded-xl bg-red-950 p-3 text-sm text-red-200">{analysisState.errorMessage}</p>
      )}

      {/* Results: replay with skeleton overlay + summary */}
      {selectedVideo !== null && analysisState.status === "done" && (
        <div className="space-y-4">
          <PoseReplayPlayer videoUrl={selectedVideo.videoUrl} recording={analysisState.extractionResult.recording} />
          <RecordingSummary
            fileName={selectedVideo.fileName}
            recording={analysisState.extractionResult.recording}
            stats={analysisState.extractionResult.stats}
          />
        </div>
      )}
    </section>
  );
}
