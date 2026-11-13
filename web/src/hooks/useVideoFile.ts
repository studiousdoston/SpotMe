import { useCallback, useEffect, useRef, useState } from "react";
import { probeVideo } from "@/lib/video/probeVideo";
import type { SelectedVideo } from "@/types/session";

export type VideoFileState =
  | { status: "empty" }
  | { status: "checking"; fileName: string }
  | { status: "unsupported"; fileName: string };

// Opens a picked file as a blob: URL and checks the browser can decode it.
// The file never leaves the browser. While checking, this hook owns the URL;
// once the video is accepted, ownership passes to the caller (the workout session),
// which revokes it later. Rejected or abandoned URLs are revoked here.
export function useVideoFile() {
  const [videoFileState, setVideoFileState] = useState<VideoFileState>({ status: "empty" });
  const checkingVideoUrlRef = useRef<string | null>(null);

  // Frees the URL that is still being checked, if any.
  const releaseCheckingVideoUrl = useCallback(() => {
    if (checkingVideoUrlRef.current !== null) {
      URL.revokeObjectURL(checkingVideoUrlRef.current);
      checkingVideoUrlRef.current = null;
    }
  }, []);

  // Revoke on unmount (e.g. leaving the page mid-check).
  useEffect(() => releaseCheckingVideoUrl, [releaseCheckingVideoUrl]);

  // Resolves with the accepted video (caller now owns its URL), or null if rejected/superseded.
  const openVideoFile = useCallback(
    async (videoFile: File): Promise<SelectedVideo | null> => {
      releaseCheckingVideoUrl();
      const videoUrl = URL.createObjectURL(videoFile);
      checkingVideoUrlRef.current = videoUrl;
      setVideoFileState({ status: "checking", fileName: videoFile.name });

      const probeResult = await probeVideo(videoUrl);

      // Another file was picked (or the page unmounted) while this one was being checked.
      if (checkingVideoUrlRef.current !== videoUrl) return null;

      if (!probeResult.canDecode) {
        releaseCheckingVideoUrl();
        setVideoFileState({ status: "unsupported", fileName: videoFile.name });
        return null;
      }

      // Hand the URL over: from here on it is not ours to revoke.
      checkingVideoUrlRef.current = null;
      setVideoFileState({ status: "empty" });
      return {
        fileName: videoFile.name,
        videoUrl,
        videoWidth: probeResult.videoWidth,
        videoHeight: probeResult.videoHeight,
        durationSeconds: probeResult.durationSeconds,
      };
    },
    [releaseCheckingVideoUrl],
  );

  return { videoFileState, openVideoFile };
}
