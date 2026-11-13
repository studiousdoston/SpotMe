import { formatRepCount } from "@/lib/exercises";
import type { AnalysisResult } from "@/types/analysis";

// Big rep count plus "4/6 good depth" style chips.
export function RepCountSummary({ analysis }: { analysis: AnalysisResult }) {
  const repCount = analysis.reps.length;
  const goodDepthCount = analysis.reps.filter((rep) => rep.depthFeedback.code === "good_depth").length;
  const controlledCount = analysis.reps.filter((rep) => rep.tempoFeedback.code === "controlled").length;

  const summaryChips = [`${goodDepthCount}/${repCount} good depth`, `${controlledCount}/${repCount} controlled`];

  return (
    <div className="space-y-3">
      <p className="text-4xl font-bold tracking-tight">{formatRepCount(analysis.exercise, repCount)}</p>

      {repCount > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {summaryChips.map((chipText) => (
            <li key={chipText} className="rounded-full bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200">
              {chipText}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-400">No full reps found. Make sure every rep is fully in the video.</p>
      )}
    </div>
  );
}
