import { useEffect, useState, type RefObject } from "react";
import { fitContain, type DisplayRect } from "@/lib/video/fitContain";

export type DisplayedVideo = {
  // The visible video picture inside the <video> box, in CSS px.
  rect: DisplayRect;
  // Canvas pixels per CSS pixel, for a sharp canvas on high-DPI screens.
  devicePixelRatio: number;
};

// Tracks where (and how big) the video picture is displayed inside its <video> element
// (object-fit: contain), updating on resize, phone rotation and browser zoom.
export function useDisplayedVideoRect(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoWidth: number,
  videoHeight: number,
): DisplayedVideo | null {
  const [displayedVideo, setDisplayedVideo] = useState<DisplayedVideo | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement === null) return;

    // Measure the element's box and fit the video's aspect ratio into it.
    const measure = (): void => {
      const rect = fitContain(videoElement.clientWidth, videoElement.clientHeight, videoWidth, videoHeight);
      const devicePixelRatio = window.devicePixelRatio || 1;
      setDisplayedVideo((previous) =>
        previous !== null &&
        previous.devicePixelRatio === devicePixelRatio &&
        previous.rect.left === rect.left &&
        previous.rect.top === rect.top &&
        previous.rect.width === rect.width &&
        previous.rect.height === rect.height
          ? previous
          : { rect, devicePixelRatio },
      );
    };

    // ResizeObserver covers layout changes and rotation (and fires once right away);
    // window resize also catches browser zoom, which changes devicePixelRatio.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(videoElement);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [videoRef, videoWidth, videoHeight]);

  return displayedVideo;
}
