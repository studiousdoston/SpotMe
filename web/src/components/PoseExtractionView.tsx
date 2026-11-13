import { useRef } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseExtraction } from "@/hooks/usePoseExtraction";
import type { ExtractionResult } from "@/lib/pose/extractLandmarks";

type PoseExtractionViewProps = {
  videoUrl: string;
  poseLandmarker: PoseLandmarker;
  onComplete: (extractionResult: ExtractionResult) => void;
  onError: (errorMessage: string) => void;
  onCancel: () => void;
};

// Plays the video (muted) while pose detection runs, with a progress bar and Cancel.
// Mounting this component starts the analysis; unmounting it stops it.
export function PoseExtractionView({ videoUrl, poseLandmarker, onComplete, onError, onCancel }: PoseExtractionViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { progressPercent, playbackRate } = usePoseExtraction({ videoRef, poseLandmarker, onComplete, onError });

  // Before playback starts, the first frame is being analyzed while paused.
  const statusText = playbackRate === null ? "Preparing video…" : `Analyzing at ${playbackRate}× speed`;

  return (
    <div className="space-y-4">
      {/* The video being analyzed. It has to be on screen: browsers only report presented frames. */}
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        playsInline
        preload="auto"
        className="block max-h-64 w-full rounded-xl bg-black object-contain"
      />

      {/* Progress through the video's duration, plus the current analysis speed */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-neutral-400">
          <span>{statusText}</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          className="h-2 overflow-hidden rounded-full bg-neutral-800"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="h-12 w-full rounded-xl border border-neutral-700 font-medium text-neutral-200 active:bg-neutral-800"
      >
        Cancel
      </button>
    </div>
  );
}
