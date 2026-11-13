// How long to wait for the browser to read the video's metadata.
const PROBE_TIMEOUT_MS = 10_000;

export type VideoProbeResult =
  | { canDecode: true; videoWidth: number; videoHeight: number; durationSeconds: number }
  | { canDecode: false };

// Checks whether this browser can open the video, using a throwaway <video> element.
// A width of 0 means the browser read the container but not the video track
// (common with HEVC/H.265 iPhone .MOV files in Chrome).
export function probeVideo(videoUrl: string): Promise<VideoProbeResult> {
  return new Promise((resolve) => {
    const probeElement = document.createElement("video");
    probeElement.preload = "metadata";
    probeElement.muted = true;

    // Release the element and listeners once we have an answer.
    function finish(result: VideoProbeResult): void {
      window.clearTimeout(timeoutTimer);
      probeElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      probeElement.removeEventListener("error", handleError);
      probeElement.removeAttribute("src");
      probeElement.load();
      resolve(result);
    }

    function handleLoadedMetadata(): void {
      if (probeElement.videoWidth > 0 && probeElement.videoHeight > 0) {
        finish({
          canDecode: true,
          videoWidth: probeElement.videoWidth,
          videoHeight: probeElement.videoHeight,
          durationSeconds: probeElement.duration,
        });
      } else {
        finish({ canDecode: false });
      }
    }

    function handleError(): void {
      finish({ canDecode: false });
    }

    const timeoutTimer = window.setTimeout(() => finish({ canDecode: false }), PROBE_TIMEOUT_MS);
    probeElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    probeElement.addEventListener("error", handleError);
    probeElement.src = videoUrl;
  });
}
