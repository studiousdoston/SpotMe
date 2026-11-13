import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { renderReplayFrame } from "@/lib/pose/overlay";
import type { AnalysisResult } from "@/types/analysis";
import type { PoseRecording } from "@/types/pose";

// What parents can do with the player through its ref.
export type PoseReplayPlayerHandle = {
  // Jumps to this video time and brings the player into view.
  seekTo: (timeSeconds: number) => void;
};

type PoseReplayPlayerProps = {
  videoUrl: string;
  recording: PoseRecording;
  // When given (and showOverlay is on), the coaching overlay is drawn too.
  analysis?: AnalysisResult | null;
  showOverlay?: boolean;
  ref?: Ref<PoseReplayPlayerHandle>;
};

// Plays the original video with a canvas exactly on top that draws the stored skeleton
// and the coaching overlay (all drawing lives in lib/pose/overlay.ts).
// Video and canvas share the same box and both use object-contain with the same
// aspect ratio, so the drawing lines up at any screen size.
export function PoseReplayPlayer({ videoUrl, recording, analysis, showOverlay = true, ref }: PoseReplayPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Seeking: the "seeked" listener below redraws the skeleton at the new time.
  useImperativeHandle(
    ref,
    () => ({
      seekTo: (timeSeconds: number) => {
        if (videoRef.current !== null) videoRef.current.currentTime = timeSeconds;
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }),
    [],
  );

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const context = canvasElement?.getContext("2d");
    if (!videoElement || !canvasElement || !context) return;

    // Redraws everything (skeleton + overlay) for this video time.
    const drawFrameAt = (timeSeconds: number): void => {
      renderReplayFrame(context, {
        recording,
        analysis,
        timeSeconds,
        showOverlay,
        canvasWidth: canvasElement.width,
        canvasHeight: canvasElement.height,
      });
    };

    // While playing: redraw on every presented frame, using that frame's exact media time.
    let frameCallbackHandle = 0;
    const handleVideoFrame = (_now: DOMHighResTimeStamp, frameMetadata: VideoFrameCallbackMetadata): void => {
      drawFrameAt(frameMetadata.mediaTime);
      frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);
    };
    frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);

    // While paused: redraw after seeking, once the first frame loads, and right away
    // (this effect also re-runs when the overlay is toggled).
    const drawAtCurrentTime = (): void => drawFrameAt(videoElement.currentTime);
    videoElement.addEventListener("seeked", drawAtCurrentTime);
    videoElement.addEventListener("loadeddata", drawAtCurrentTime);
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) drawAtCurrentTime();

    return () => {
      videoElement.cancelVideoFrameCallback(frameCallbackHandle);
      videoElement.removeEventListener("seeked", drawAtCurrentTime);
      videoElement.removeEventListener("loadeddata", drawAtCurrentTime);
    };
  }, [recording, analysis, showOverlay]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        preload="auto"
        className="block max-h-[70vh] w-full object-contain"
      />
      {/* Canvas uses the video's native resolution; CSS scales it with the video. */}
      <canvas
        ref={canvasRef}
        width={recording.videoWidth}
        height={recording.videoHeight}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}
