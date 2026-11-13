import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { DepthChart } from "@/components/DepthChart";
import { DownloadLandmarksButton } from "@/components/DownloadLandmarksButton";
import { PoseReplayPlayer, type PoseReplayPlayerHandle } from "@/components/PoseReplayPlayer";
import { RecordingSummary } from "@/components/RecordingSummary";
import { RepCountSummary } from "@/components/RepCountSummary";
import { RepList } from "@/components/RepList";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import type { RepResult } from "@/types/analysis";

// Results for the current set: replay, rep count, per-rep grades and the depth chart.
export function ResultsPage() {
  const navigate = useNavigate();
  const playerRef = useRef<PoseReplayPlayerHandle>(null);
  const [isOverlayOn, setIsOverlayOn] = useState(true);
  const { session, clearSession } = useWorkoutSession();
  const { video, recording, extractionStats, analysis } = session;

  // Nothing analyzed in this tab (e.g. after a reload): start over.
  if (video === null || recording === null || extractionStats === null || analysis === null) {
    return <Navigate to="/" replace />;
  }

  function handleSelectRep(rep: RepResult): void {
    playerRef.current?.seekTo(rep.startSeconds);
  }

  function handleAnalyzeAnother(): void {
    void navigate("/");
    clearSession();
  }

  return (
    <section className="space-y-6">
      {/* Replay with skeleton + coaching overlay, and the overlay toggle (only useful when reps were counted) */}
      <div className="space-y-2">
        <PoseReplayPlayer
          ref={playerRef}
          videoUrl={video.videoUrl}
          recording={recording}
          analysis={analysis}
          showOverlay={isOverlayOn}
        />
        {analysis.status === "ok" && (
          <button
            type="button"
            aria-pressed={isOverlayOn}
            onClick={() => setIsOverlayOn((wasOverlayOn) => !wasOverlayOn)}
            className="flex h-11 w-full items-center justify-between rounded-xl bg-neutral-900 px-4 text-sm font-medium text-neutral-200 active:bg-neutral-800"
          >
            <span>Coaching overlay</span>
            <span className={isOverlayOn ? "text-accent" : "text-neutral-500"}>{isOverlayOn ? "On" : "Off"}</span>
          </button>
        )}
      </div>

      {analysis.status === "low_visibility" ? (
        // Couldn't see enough of the body: the server's advice replaces the reps.
        <div role="alert" className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-lg font-semibold text-amber-100">Couldn't count this set</p>
          <p className="text-amber-100/90">{analysis.message}</p>
        </div>
      ) : (
        <>
          <RepCountSummary analysis={analysis} />

          {analysis.reps.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">Reps</h2>
              <p className="text-sm text-neutral-400">Tap a rep to watch it.</p>
              <RepList reps={analysis.reps} onSelectRep={handleSelectRep} />
            </div>
          )}

          {analysis.depthSignal !== null && <DepthChart depthSignal={analysis.depthSignal} reps={analysis.reps} />}
        </>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleAnalyzeAnother}
          className="h-14 w-full rounded-xl bg-accent text-lg font-semibold text-neutral-950 active:brightness-90"
        >
          Analyze another set
        </button>
        <DownloadLandmarksButton videoFileName={video.fileName} recording={recording} />
      </div>

      {/* Debug numbers from the in-browser pose extraction */}
      <details className="rounded-xl bg-neutral-900/50 p-3">
        <summary className="cursor-pointer text-sm text-neutral-400">Processing details</summary>
        <div className="mt-3">
          <RecordingSummary stats={extractionStats} />
        </div>
      </details>
    </section>
  );
}
