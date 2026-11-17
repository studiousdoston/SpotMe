import { FeedbackBadge } from "@/components/FeedbackBadge";
import { ARM_NAMES, ARM_SIDES } from "@/lib/curlArms";
import type { CurlAnalysisResult, CurlRepResult } from "@/types/analysis";

type CurlRepListProps = {
  analysis: CurlAnalysisResult;
  // Tapping a curl jumps the video to it.
  onSelectRep: (rep: CurlRepResult) => void;
};

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

// One group per arm; one tappable row per curl: number, full/partial badge, top elbow angle.
export function CurlRepList({ analysis, onSelectRep }: CurlRepListProps) {
  return (
    <div className="space-y-4">
      {ARM_SIDES.map((armSide) => {
        const armResult = analysis.arms[armSide];
        const armName = ARM_NAMES[armSide];
        return (
          <section key={armSide} className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-300">{armName} arm</h3>

            {armResult.repCount === null && (
              <p className="text-sm text-neutral-400">Hidden: this arm wasn't visible enough to count.</p>
            )}
            {armResult.repCount === 0 && <p className="text-sm text-neutral-400">No curls found.</p>}

            <ol className="space-y-2">
              {armResult.reps.map((rep) => (
                <li key={rep.repNumber}>
                  <button
                    type="button"
                    onClick={() => onSelectRep(rep)}
                    aria-label={`${armName} curl ${rep.repNumber}: ${rep.rangeFeedback.text}, top angle ${Math.round(rep.topAngle)} degrees. Play from ${formatSeconds(rep.startSeconds)}.`}
                    className="flex w-full items-center gap-3 rounded-xl bg-neutral-900 p-3 text-left active:bg-neutral-800"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg font-bold tabular-nums">
                      {rep.repNumber}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex flex-wrap gap-1.5">
                        <FeedbackBadge feedback={rep.rangeFeedback} />
                      </span>
                      <span className="block text-sm text-neutral-400 tabular-nums">
                        Top angle {Math.round(rep.topAngle)}°
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-neutral-500">
                      ▶
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
