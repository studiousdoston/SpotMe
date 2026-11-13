import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { findNearestFrame } from "@/lib/pose/findNearestFrame";
import { drawSkeleton } from "@/lib/pose/skeleton";
import type { PoseRecording } from "@/types/pose";

// What parents can do with the player through its ref.
export type PoseReplayPlayerHandle = {
  // Jumps to this video time and brings the player into view.
  seekTo: (timeSeconds: number) => void;
};

type PoseReplayPlayerProps = {
  videoUrl: string;
  recording: PoseRecording;
  ref?: Ref<PoseReplayPlayerHandle>;
};

// Plays the original video with a canvas exactly on top that draws the stored skeleton.
// Video and canvas share the same box and both use object-contain with the same
// aspect ratio, so the skeleton lines up at any screen size.
export function PoseReplayPlayer({ videoUrl, recording, ref }: PoseReplayPlayerProps) {
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

    // Clears the overlay and draws the skeleton stored closest to this video time.
    const drawOverlayAt = (videoTimeMs: number): void => {
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      const nearestFrame = findNearestFrame(recording.frames, videoTimeMs);
      if (nearestFrame?.landmarks) {
        drawSkeleton(context, nearestFrame.landmarks, canvasElement.width, canvasElement.height);
      }
    };

    // While playing: redraw on every presented frame, using that frame's exact media time.
    let frameCallbackHandle = 0;
    const handleVideoFrame = (_now: DOMHighResTimeStamp, frameMetadata: VideoFrameCallbackMetadata): void => {
      drawOverlayAt(frameMetadata.mediaTime * 1000);
      frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);
    };
    frameCallbackHandle = videoElement.requestVideoFrameCallback(handleVideoFrame);

    // While paused: redraw after seeking and once the first frame loads.
    const drawAtCurrentTime = (): void => drawOverlayAt(videoElement.currentTime * 1000);
    videoElement.addEventListener("seeked", drawAtCurrentTime);
    videoElement.addEventListener("loadeddata", drawAtCurrentTime);
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) drawAtCurrentTime();

    return () => {
      videoElement.cancelVideoFrameCallback(frameCallbackHandle);
      videoElement.removeEventListener("seeked", drawAtCurrentTime);
      videoElement.removeEventListener("loadeddata", drawAtCurrentTime);
    };
  }, [recording]);

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
