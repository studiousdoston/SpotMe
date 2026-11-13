import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { createDetectorClock } from "@/lib/pose/landmarker";
import type { Landmark, PoseExtractionStats, PoseFrame, PoseRecording } from "@/types/pose";

// If the first frame isn't ready this long after we ask for it, the browser can't decode the video.
const FIRST_FRAME_TIMEOUT_MS = 8000;
// After a seek, how long to wait for a frame callback before falling back to currentTime.
const SEEK_FRAME_CALLBACK_GRACE_MS = 300;

// Safety net for slow devices: playback speeds to step down through (never below 0.25×).
const PLAYBACK_RATE_STEPS = [1, 0.5, 0.25];
// Speed is judged over windows of this many analyzed frames (a fresh window starts after each check,
// so frames analyzed at the old speed never count against the new one)...
const SPEED_CHECK_WINDOW_FRAMES = 10;
// ...and playback slows down when more than this share of the window's presented frames were skipped.
// The share matters, not single gaps: a phone that steadily misses every other frame (50%) never
// shows a gap of more than 2 frame intervals, which is why a per-gap rule never fired on iOS.
// One stray skip in a window (~9%) is tolerated as a hiccup.
const MAX_SKIPPED_SHARE = 0.1;

export type ExtractionResult = {
  recording: PoseRecording;
  stats: PoseExtractionStats;
};

export type ExtractionProgress = {
  progressFraction: number;
  playbackRate: number;
};

type ExtractLandmarksOptions = {
  videoElement: HTMLVideoElement;
  poseLandmarker: PoseLandmarker;
  signal: AbortSignal;
  // Called on every analyzed frame during playback.
  onProgress: (progress: ExtractionProgress) => void;
};

// Thrown when the browser can't show a decodable frame of the video.
export class VideoDecodeError extends Error {}

function createAbortError(): DOMException {
  return new DOMException("Extraction cancelled.", "AbortError");
}

// ---- Per-run frame storage ----

// Runs detection on the video's current frame and keeps the results + stats for one run.
class FrameRecorder {
  readonly frames: PoseFrame[] = [];
  framesWithPerson = 0;
  largestGapMs = 0;
  private readonly toDetectorTimestamp = createDetectorClock();
  private readonly poseLandmarker: PoseLandmarker;
  private readonly videoElement: HTMLVideoElement;

  constructor(poseLandmarker: PoseLandmarker, videoElement: HTMLVideoElement) {
    this.poseLandmarker = poseLandmarker;
    this.videoElement = videoElement;
  }

  // Analyzes the frame currently shown by the video, stamped with its media time.
  // Frames that don't move forward in time are ignored (timestamps must strictly increase).
  analyzeCurrentFrame(videoTimeMs: number): void {
    const previousFrame = this.frames.at(-1);
    if (previousFrame !== undefined && videoTimeMs <= previousFrame.timestampMs) return;

    const poseResult = this.poseLandmarker.detectForVideo(this.videoElement, this.toDetectorTimestamp(videoTimeMs));
    const detectedLandmarks = poseResult.landmarks[0];
    const landmarks: Landmark[] | null = detectedLandmarks
      ? detectedLandmarks.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
          visibility: landmark.visibility,
        }))
      : null;

    if (landmarks !== null) this.framesWithPerson += 1;
    if (previousFrame !== undefined) {
      this.largestGapMs = Math.max(this.largestGapMs, videoTimeMs - previousFrame.timestampMs);
    }
    this.frames.push({ timestampMs: videoTimeMs, landmarks });
  }
}

// ---- Step 1: show the first frame while paused ----

type ShownFrame = {
  videoTimeMs: number;
  // Browser's presented-frame counter, when known (used to detect skipped frames later).
  presentedFrames: number | null;
};

// Loads the video, seeks to 0 and resolves once the first frame is on screen, still paused.
function showFirstFrame(videoElement: HTMLVideoElement, signal: AbortSignal): Promise<ShownFrame> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    let frameCallbackHandle: number | null = null;
    let seekedGraceTimer: number | undefined;

    function cleanUp(): void {
      isSettled = true;
      if (frameCallbackHandle !== null) videoElement.cancelVideoFrameCallback(frameCallbackHandle);
      window.clearTimeout(timeoutTimer);
      window.clearTimeout(seekedGraceTimer);
      videoElement.removeEventListener("loadeddata", handleLoadedData);
      videoElement.removeEventListener("seeked", handleSeeked);
      videoElement.removeEventListener("error", handleVideoError);
      signal.removeEventListener("abort", handleAbort);
    }

    function succeed(shownFrame: ShownFrame): void {
      if (isSettled) return;
      cleanUp();
      resolve(shownFrame);
    }

    function fail(error: Error): void {
      if (isSettled) return;
      cleanUp();
      reject(error);
    }

    // Preferred: the frame callback gives the exact media time of the shown frame.
    function handleVideoFrame(_now: DOMHighResTimeStamp, frameMetadata: VideoFrameCallbackMetadata): void {
      succeed({ videoTimeMs: frameMetadata.mediaTime * 1000, presentedFrames: frameMetadata.presentedFrames });
    }

    // Fallback: some browsers don't fire frame callbacks for seeks while paused.
    function handleSeeked(): void {
      seekedGraceTimer = window.setTimeout(
        () => succeed({ videoTimeMs: videoElement.currentTime * 1000, presentedFrames: null }),
        SEEK_FRAME_CALLBACK_GRACE_MS,
      );
    }

    // Data is available: make sure we're paused, then seek to the very start.
    function handleLoadedData(): void {
      videoElement.pause();
      frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);
      videoElement.addEventListener("seeked", handleSeeked);
      videoElement.currentTime = 0;
    }

    function handleVideoError(): void {
      fail(new VideoDecodeError("The browser couldn't decode this video."));
    }

    function handleAbort(): void {
      fail(createAbortError());
    }

    const timeoutTimer = window.setTimeout(() => {
      fail(new VideoDecodeError("No video frame arrived. The browser probably can't decode this video."));
    }, FIRST_FRAME_TIMEOUT_MS);

    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort);
    videoElement.addEventListener("error", handleVideoError);

    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      handleLoadedData();
    } else {
      // Some mobile browsers (notably iOS Safari) don't load video data until playback starts,
      // so start muted playback just to load; handleLoadedData pauses it and seeks back to 0.
      videoElement.addEventListener("loadeddata", handleLoadedData, { once: true });
      videoElement.play().catch(() => {
        // Expected: the pause in handleLoadedData interrupts this play() call.
      });
    }
  });
}

// ---- Step 2: play and analyze every presented frame ----

type PlayAndAnalyzeOptions = {
  videoElement: HTMLVideoElement;
  frameRecorder: FrameRecorder;
  firstShownFrame: ShownFrame;
  signal: AbortSignal;
  onProgress: (progress: ExtractionProgress) => void;
};

type PlaybackResult = {
  framesSkipped: number;
  // Speed requested at the end of the run.
  finalPlaybackRate: number;
  // Measured: video seconds played per wall-clock second (shows whether the browser honored playbackRate).
  averagePlaybackSpeed: number;
};

// Plays to the end, analyzing each presented frame. Slows playback down if detection
// can't keep up.
function playAndAnalyze({
  videoElement,
  frameRecorder,
  firstShownFrame,
  signal,
  onProgress,
}: PlayAndAnalyzeOptions): Promise<PlaybackResult> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    let frameCallbackHandle: number | null = null;
    let framesSkipped = 0;
    let lastPresentedFrameNumber = firstShownFrame.presentedFrames;

    // Speed control state.
    let playbackRateStepIndex = 0;
    let desiredPlaybackRate = PLAYBACK_RATE_STEPS[0];
    let windowAnalyzedFrames = 0;
    let windowSkippedFrames = 0;
    let hasWarnedAboutRateReset = false;

    // First and latest frame callbacks (wall time + video time), for the measured average speed.
    let firstCallback: { wallTimeMs: number; mediaTimeSeconds: number } | null = null;
    let latestCallback: { wallTimeMs: number; mediaTimeSeconds: number } | null = null;

    function cleanUp(): void {
      isSettled = true;
      if (frameCallbackHandle !== null) videoElement.cancelVideoFrameCallback(frameCallbackHandle);
      videoElement.pause();
      videoElement.removeEventListener("ended", handleEnded);
      videoElement.removeEventListener("error", handleVideoError);
      signal.removeEventListener("abort", handleAbort);
    }

    function fail(error: Error): void {
      if (isSettled) return;
      cleanUp();
      reject(error);
    }

    // Every SPEED_CHECK_WINDOW_FRAMES analyzed frames: if too many presented frames were skipped
    // in that window, drop to the next slower speed. Then start a fresh window.
    function slowDownIfFallingBehind(skippedSinceLastFrame: number): void {
      windowAnalyzedFrames += 1;
      windowSkippedFrames += skippedSinceLastFrame;
      if (windowAnalyzedFrames < SPEED_CHECK_WINDOW_FRAMES) return;

      const skippedShare = windowSkippedFrames / (windowSkippedFrames + windowAnalyzedFrames);
      const canSlowDown = playbackRateStepIndex < PLAYBACK_RATE_STEPS.length - 1;
      if (skippedShare > MAX_SKIPPED_SHARE && canSlowDown) {
        playbackRateStepIndex += 1;
        desiredPlaybackRate = PLAYBACK_RATE_STEPS[playbackRateStepIndex];
        videoElement.playbackRate = desiredPlaybackRate;
      }
      windowAnalyzedFrames = 0;
      windowSkippedFrames = 0;
    }

    // Some browsers may reset playbackRate during playback; put it back if so (and say so once).
    function keepDesiredPlaybackRate(): void {
      if (videoElement.playbackRate === desiredPlaybackRate) return;
      if (!hasWarnedAboutRateReset) {
        console.warn(
          `playbackRate was ${videoElement.playbackRate}, expected ${desiredPlaybackRate}; re-applying.`,
        );
        hasWarnedAboutRateReset = true;
      }
      videoElement.playbackRate = desiredPlaybackRate;
    }

    // Video seconds played per wall-clock second, between the first and latest frame callbacks.
    function measureAveragePlaybackSpeed(): number {
      if (firstCallback === null || latestCallback === null) return desiredPlaybackRate;
      const wallSeconds = (latestCallback.wallTimeMs - firstCallback.wallTimeMs) / 1000;
      if (wallSeconds <= 0) return desiredPlaybackRate;
      return (latestCallback.mediaTimeSeconds - firstCallback.mediaTimeSeconds) / wallSeconds;
    }

    // Runs once per presented frame: count skips, detect, adjust speed, report progress.
    function handleVideoFrame(now: DOMHighResTimeStamp, frameMetadata: VideoFrameCallbackMetadata): void {
      if (isSettled) return;

      latestCallback = { wallTimeMs: now, mediaTimeSeconds: frameMetadata.mediaTime };
      firstCallback ??= latestCallback;
      keepDesiredPlaybackRate();

      // Frames presented while detection was busy never reach this callback.
      const skippedSinceLastFrame =
        lastPresentedFrameNumber === null
          ? 0
          : Math.max(0, frameMetadata.presentedFrames - lastPresentedFrameNumber - 1);
      framesSkipped += skippedSinceLastFrame;
      lastPresentedFrameNumber = frameMetadata.presentedFrames;

      try {
        frameRecorder.analyzeCurrentFrame(frameMetadata.mediaTime * 1000);
      } catch (detectionError: unknown) {
        fail(detectionError instanceof Error ? detectionError : new Error("Pose detection failed."));
        return;
      }

      slowDownIfFallingBehind(skippedSinceLastFrame);

      // Progress as a share of the duration (unknown durations report 0).
      const hasKnownDuration = Number.isFinite(videoElement.duration) && videoElement.duration > 0;
      onProgress({
        progressFraction: hasKnownDuration ? Math.min(1, frameMetadata.mediaTime / videoElement.duration) : 0,
        playbackRate: desiredPlaybackRate,
      });

      frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);
    }

    function handleEnded(): void {
      if (isSettled) return;
      cleanUp();
      resolve({
        framesSkipped,
        finalPlaybackRate: desiredPlaybackRate,
        averagePlaybackSpeed: measureAveragePlaybackSpeed(),
      });
    }

    function handleVideoError(): void {
      fail(new VideoDecodeError("The browser couldn't decode this video."));
    }

    function handleAbort(): void {
      fail(createAbortError());
    }

    if (signal.aborted) {
      handleAbort();
      return;
    }

    // Wire up listeners, register for the next frame, then start playback at full speed.
    signal.addEventListener("abort", handleAbort);
    videoElement.addEventListener("ended", handleEnded);
    videoElement.addEventListener("error", handleVideoError);
    videoElement.playbackRate = desiredPlaybackRate;
    frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);
    onProgress({ progressFraction: 0, playbackRate: desiredPlaybackRate });
    videoElement.play().catch((playError: unknown) => {
      // play() rejects with AbortError when we pause during cleanup; that's not a failure.
      if (playError instanceof DOMException && playError.name === "AbortError") return;
      fail(playError instanceof Error ? playError : new Error("The video couldn't be played."));
    });
  });
}

// ---- Public entry point ----

// Analyzes a whole video:
//   1. load it and analyze the first frame while PAUSED (absorbs the landmark-stage warm-up),
//   2. play it muted and analyze every presented frame until it ends.
// Rejects with an AbortError when the signal is aborted.
export async function extractLandmarks({
  videoElement,
  poseLandmarker,
  signal,
  onProgress,
}: ExtractLandmarksOptions): Promise<ExtractionResult> {
  const processingStartTime = performance.now();
  const frameRecorder = new FrameRecorder(poseLandmarker, videoElement);
  videoElement.muted = true;

  // Step 1: first frame, paused.
  const firstShownFrame = await showFirstFrame(videoElement, signal);
  signal.throwIfAborted();
  frameRecorder.analyzeCurrentFrame(firstShownFrame.videoTimeMs);

  // Step 2: playback.
  const playbackResult = await playAndAnalyze({ videoElement, frameRecorder, firstShownFrame, signal, onProgress });

  return {
    recording: {
      frames: frameRecorder.frames,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      durationSeconds: videoElement.duration,
    },
    stats: {
      framesProcessed: frameRecorder.frames.length,
      framesWithPerson: frameRecorder.framesWithPerson,
      framesSkipped: playbackResult.framesSkipped,
      largestGapMs: frameRecorder.largestGapMs,
      processingTimeMs: performance.now() - processingStartTime,
      finalPlaybackRate: playbackResult.finalPlaybackRate,
      averagePlaybackSpeed: playbackResult.averagePlaybackSpeed,
    },
  };
}
