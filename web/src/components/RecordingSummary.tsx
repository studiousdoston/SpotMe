import type { PoseExtractionStats } from "@/types/pose";

// Numbers about the in-browser pose extraction (useful for spotting skipped frames).
export function RecordingSummary({ stats }: { stats: PoseExtractionStats }) {
  const personFoundPercent =
    stats.framesProcessed > 0
      ? Math.round((stats.framesWithPerson / stats.framesProcessed) * 100)
      : 0;

  const summaryItems = [
    { label: "Frames processed", value: stats.framesProcessed.toString() },
    { label: "Person found", value: `${personFoundPercent}%` },
    {
      label: "Processing time",
      value: `${(stats.processingTimeMs / 1000).toFixed(1)} s`,
    },
    { label: "Frames skipped", value: stats.framesSkipped.toString() },
    {
      label: "Largest gap (ms)",
      value: Math.round(stats.largestGapMs).toString(),
    },
    { label: "Final speed", value: `${stats.finalPlaybackRate}×` },
    // Measured, so a browser that ignores playbackRate shows up here (≈1× despite a lower final speed).
    {
      label: "Average speed",
      value: `${stats.averagePlaybackSpeed.toFixed(2)}×`,
    },
  ];

  return (
    // Stat tiles: 2 columns on phones, 3 on wider screens
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {summaryItems.map((summaryItem) => (
        <div key={summaryItem.label} className="rounded-xl bg-neutral-900 p-3">
          <dt className="text-xs text-neutral-400">{summaryItem.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {summaryItem.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
