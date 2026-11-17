import { DepthChart } from "@/components/DepthChart";
import { RepCountSummary } from "@/components/RepCountSummary";
import { RepList } from "@/components/RepList";
import type { SquatAnalysisResult } from "@/types/analysis";

type SquatResultsProps = {
  analysis: SquatAnalysisResult;
  // Tapping a rep jumps the video to this time.
  onSeek: (timeSeconds: number) => void;
};

// Squat results: rep count + grade chips, the rep list and the depth chart.
export function SquatResults({ analysis, onSeek }: SquatResultsProps) {
  return (
    <>
      <RepCountSummary analysis={analysis} />

      {analysis.reps.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Reps</h2>
          <p className="text-sm text-neutral-400">Tap a rep to watch it.</p>
          <RepList reps={analysis.reps} onSelectRep={(rep) => onSeek(rep.startSeconds)} />
        </div>
      )}

      {analysis.depthSignal !== null && <DepthChart depthSignal={analysis.depthSignal} reps={analysis.reps} />}
    </>
  );
}
