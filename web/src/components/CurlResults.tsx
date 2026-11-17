import { CurlCountSummary } from "@/components/CurlCountSummary";
import { CurlRepList } from "@/components/CurlRepList";
import { CurlHeightChart } from "@/components/CurlHeightChart";
import { WarningList } from "@/components/WarningList";
import type { CurlAnalysisResult } from "@/types/analysis";

type CurlResultsProps = {
  analysis: CurlAnalysisResult;
  // Tapping a curl jumps the video to this time.
  onSeek: (timeSeconds: number) => void;
};

// Curl results: per-arm counts, warnings, curls grouped by arm, and both arms' curl height over time.
export function CurlResults({ analysis, onSeek }: CurlResultsProps) {
  const hasReps = analysis.arms.left.reps.length > 0 || analysis.arms.right.reps.length > 0;

  return (
    <>
      <CurlCountSummary analysis={analysis} />
      <WarningList warnings={analysis.warnings} />

      {hasReps && (
        <div className="space-y-2">
          <h2 className="font-semibold">Curls</h2>
          <p className="text-sm text-neutral-400">Tap a curl to watch it.</p>
          <CurlRepList analysis={analysis} onSelectRep={(rep) => onSeek(rep.startSeconds)} />
        </div>
      )}

      <CurlHeightChart analysis={analysis} />
    </>
  );
}
