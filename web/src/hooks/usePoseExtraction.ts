import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { extractLandmarks, VideoDecodeError, type ExtractionResult } from "@/lib/pose/extractLandmarks";

type UsePoseExtractionOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  poseLandmarker: PoseLandmarker;
  onComplete: (extractionResult: ExtractionResult) => void;
  onError: (errorMessage: string) => void;
};

export type PoseExtractionProgress = {
  // Whole percent, 0–100.
  progressPercent: number;
  // Current playback speed, or null while the first frame is still being prepared.
  playbackRate: number | null;
  // True while paused because SpotMe is in the background.
  isPausedInBackground: boolean;
  // True once this run has been paused at least once (keeps the "keep SpotMe open" reminder up).
  wasPausedInBackground: boolean;
};

// Turns any extraction failure into a message for the user.
function describeExtractionError(error: unknown): string {
  if (error instanceof VideoDecodeError) {
    return "This browser can't decode the video. iPhone HEVC (.MOV) files often fail in Chrome. Try Safari, or export the video as H.264 MP4.";
  }
  return "Pose detection failed on this video. Try again, or try a different video.";
}

// Runs pose extraction on the video element as soon as the component mounts.
// Unmounting the component aborts the run (that's how Cancel works).
export function usePoseExtraction({
  videoRef,
  poseLandmarker,
  onComplete,
  onError,
}: UsePoseExtractionOptions): PoseExtractionProgress {
  const [progressPercent, setProgressPercent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number | null>(null);
  const [isPausedInBackground, setIsPausedInBackground] = useState(false);
  const [wasPausedInBackground, setWasPausedInBackground] = useState(false);

  // Effect events always see the latest callbacks without restarting the run.
  const handleComplete = useEffectEvent(onComplete);
  const handleError = useEffectEvent(onError);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement === null) return;
    const abortController = new AbortController();

    extractLandmarks({
      videoElement,
      poseLandmarker,
      signal: abortController.signal,
      // Whole percents only (and React skips unchanged values), so this re-renders ~100 times, not per frame.
      onProgress: (extractionProgress) => {
        setProgressPercent(Math.floor(extractionProgress.progressFraction * 100));
        setPlaybackRate(extractionProgress.playbackRate);
        setIsPausedInBackground(extractionProgress.isPausedInBackground);
        if (extractionProgress.isPausedInBackground) setWasPausedInBackground(true);
      },
    })
      .then((extractionResult) => handleComplete(extractionResult))
      .catch((extractionError: unknown) => {
        // Aborts come from Cancel/unmount, not from a real failure.
        if (extractionError instanceof DOMException && extractionError.name === "AbortError") return;
        console.error("Pose extraction failed.", extractionError);
        handleError(describeExtractionError(extractionError));
      });

    return () => abortController.abort();
  }, [videoRef, poseLandmarker]);

  return { progressPercent, playbackRate, isPausedInBackground, wasPausedInBackground };
}
