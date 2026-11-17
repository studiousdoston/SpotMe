import { PushupChart } from "@/components/PushupChart";
import { PushupRepList } from "@/components/PushupRepList";
import { WarningList } from "@/components/WarningList";
import { formatRepCount } from "@/lib/exercises";
import type { PushupAnalysisResult } from "@/types/analysis";

type PushupResultsProps = {
  analysis: PushupAnalysisResult;
  // Tapping a push-up jumps the video to this time.
  onSeek: (timeSeconds: number) => void;
};

// "5/7 good depth", or why depth wasn't graded.
function depthChipText(analysis: PushupAnalysisResult): string {
  if (!analysis.depthGraded) return "Depth not graded: side view";
  const goodDepthCount = analysis.reps.filter((rep) => rep.depthFeedback.code === "good_depth").length;
  return `${goodDepthCount}/${analysis.reps.length} good depth`;
}

// Push-up results: count + depth chip, warnings, the rep list, and the elbow-angle (or body-height) chart.
export function PushupResults({ analysis, onSeek }: PushupResultsProps) {
  const repCount = analysis.reps.length;

  return (
    <>
      <div className="space-y-3">
        <p className="text-4xl font-bold tracking-tight">{formatRepCount(analysis.exercise, repCount)}</p>
        {repCount > 0 ? (
          <ul className="flex flex-wrap gap-2">
            <li className="rounded-full bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200">
              {depthChipText(analysis)}
            </li>
          </ul>
        ) : (
          <p className="text-neutral-400">No push-ups found. Make sure every rep is fully in the video.</p>
        )}
      </div>

      <WarningList warnings={analysis.warnings} />

      {repCount > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Push-ups</h2>
          <p className="text-sm text-neutral-400">Tap a push-up to watch it.</p>
          <PushupRepList reps={analysis.reps} onSelectRep={(rep) => onSeek(rep.startSeconds)} />
        </div>
      )}

      <PushupChart analysis={analysis} />
    </>
  );
}
