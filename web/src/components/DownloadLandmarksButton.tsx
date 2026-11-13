import { downloadJson } from "@/lib/downloadJson";
import type { PoseRecording } from "@/types/pose";

type DownloadLandmarksButtonProps = {
  videoFileName: string;
  recording: PoseRecording;
};

// "squat_1.mp4" -> "squat_1.landmarks.json"
function toLandmarksFileName(videoFileName: string): string {
  const baseName = videoFileName.replace(/\.[^.]+$/, "");
  return `${baseName}.landmarks.json`;
}

// Saves the raw landmarks as JSON (for debugging / comparing with the notebook).
export function DownloadLandmarksButton({ videoFileName, recording }: DownloadLandmarksButtonProps) {
  return (
    <button
      type="button"
      onClick={() => downloadJson(recording, toLandmarksFileName(videoFileName))}
      className="h-12 w-full rounded-xl border border-neutral-700 font-medium text-neutral-200 active:bg-neutral-800"
    >
      Download landmarks (JSON)
    </button>
  );
}
