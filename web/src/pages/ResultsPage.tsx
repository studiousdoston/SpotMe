import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { CurlResults } from "@/components/CurlResults";
import { DownloadLandmarksButton } from "@/components/DownloadLandmarksButton";
import { PoseReplayPlayer, type PoseReplayPlayerHandle } from "@/components/PoseReplayPlayer";
import { PushupResults } from "@/components/PushupResults";
import { RecordingSummary } from "@/components/RecordingSummary";
import { SquatResults } from "@/components/SquatResults";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";

// Results for the current set: replay, then the exercise's counts, per-rep grades and chart.
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

  function handleSeek(timeSeconds: number): void {
    playerRef.current?.seekTo(timeSeconds);
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

      {analysis.status !== "ok" ? (
        // Not counted (body not visible enough, a curl not filmed from the front, or part of the video
        // never analyzed): the server's advice replaces the reps.
        <div role="alert" className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-lg font-semibold text-amber-100">Couldn't count this set</p>
          <p className="text-amber-100/90">{analysis.message}</p>
        </div>
      ) : analysis.exercise === "squat" ? (
        <SquatResults analysis={analysis} onSeek={handleSeek} />
      ) : analysis.exercise === "curl" ? (
        <CurlResults analysis={analysis} onSeek={handleSeek} />
      ) : (
        <PushupResults analysis={analysis} onSeek={handleSeek} />
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
