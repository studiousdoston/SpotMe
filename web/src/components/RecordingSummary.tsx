import { downloadJson } from "@/lib/downloadJson";
import type { PoseExtractionStats, PoseRecording } from "@/types/pose";

type RecordingSummaryProps = {
  fileName: string;
  recording: PoseRecording;
  stats: PoseExtractionStats;
};

// "squat_1.mp4" -> "squat_1.landmarks.json"
function toLandmarksFileName(videoFileName: string): string {
  const baseName = videoFileName.replace(/\.[^.]+$/, "");
  return `${baseName}.landmarks.json`;
}

// Numbers about the extraction, plus a JSON export for debugging / comparing with the notebook.
export function RecordingSummary({ fileName, recording, stats }: RecordingSummaryProps) {
  const personFoundPercent =
    stats.framesProcessed > 0 ? Math.round((stats.framesWithPerson / stats.framesProcessed) * 100) : 0;

  const summaryItems = [
    { label: "Frames processed", value: stats.framesProcessed.toString() },
    { label: "Person found", value: `${personFoundPercent}%` },
    { label: "Processing time", value: `${(stats.processingTimeMs / 1000).toFixed(1)} s` },
    { label: "Frames skipped", value: stats.framesSkipped.toString() },
    { label: "Largest gap (ms)", value: Math.round(stats.largestGapMs).toString() },
  ];

  return (
    <div className="space-y-4">
      {/* Stat tiles: 2 columns on phones, 3 on wider screens */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {summaryItems.map((summaryItem) => (
          <div key={summaryItem.label} className="rounded-xl bg-neutral-900 p-3">
            <dt className="text-xs text-neutral-400">{summaryItem.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{summaryItem.value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={() => downloadJson(recording, toLandmarksFileName(fileName))}
        className="h-12 w-full rounded-xl border border-neutral-700 font-medium text-neutral-200 active:bg-neutral-800"
      >
        Download landmarks (JSON)
      </button>
    </div>
  );
}
