import { useCallback, useEffect, useRef, useState } from "react";
import { probeVideo } from "@/lib/video/probeVideo";

// A local video the browser has confirmed it can decode.
export type SelectedVideo = {
  fileName: string;
  videoUrl: string;
  videoWidth: number;
  videoHeight: number;
  durationSeconds: number;
};

export type VideoFileState =
  | { status: "empty" }
  | { status: "checking"; fileName: string }
  | { status: "ready"; video: SelectedVideo }
  | { status: "unsupported"; fileName: string };

// Owns the object URL for the picked video. The file never leaves the browser:
// it is only exposed to <video> elements through a blob: URL, which is revoked
// when another file is picked, the video is cleared, or the component unmounts.
export function useVideoFile() {
  const [videoFileState, setVideoFileState] = useState<VideoFileState>({ status: "empty" });
  const currentVideoUrlRef = useRef<string | null>(null);

  // Frees the current blob URL, if any.
  const releaseCurrentVideoUrl = useCallback(() => {
    if (currentVideoUrlRef.current !== null) {
      URL.revokeObjectURL(currentVideoUrlRef.current);
      currentVideoUrlRef.current = null;
    }
  }, []);

  // Revoke on unmount.
  useEffect(() => releaseCurrentVideoUrl, [releaseCurrentVideoUrl]);

  // Opens a picked file and checks the browser can decode it.
  // Resolves true when the video is ready to analyze.
  const selectVideoFile = useCallback(
    async (videoFile: File): Promise<boolean> => {
      releaseCurrentVideoUrl();
      const videoUrl = URL.createObjectURL(videoFile);
      currentVideoUrlRef.current = videoUrl;
      setVideoFileState({ status: "checking", fileName: videoFile.name });

      const probeResult = await probeVideo(videoUrl);

      // Another file was picked (or the video was cleared) while this one was being checked.
      if (currentVideoUrlRef.current !== videoUrl) return false;

      if (!probeResult.canDecode) {
        releaseCurrentVideoUrl();
        setVideoFileState({ status: "unsupported", fileName: videoFile.name });
        return false;
      }

      setVideoFileState({
        status: "ready",
        video: {
          fileName: videoFile.name,
          videoUrl,
          videoWidth: probeResult.videoWidth,
          videoHeight: probeResult.videoHeight,
          durationSeconds: probeResult.durationSeconds,
        },
      });
      return true;
    },
    [releaseCurrentVideoUrl],
  );

  // Drops the current video entirely.
  const clearVideoFile = useCallback(() => {
    releaseCurrentVideoUrl();
    setVideoFileState({ status: "empty" });
  }, [releaseCurrentVideoUrl]);

  return { videoFileState, selectVideoFile, clearVideoFile };
}
