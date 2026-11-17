import { FeedbackBadge } from "@/components/FeedbackBadge";
import type { PushupRepResult } from "@/types/analysis";

type PushupRepListProps = {
  reps: PushupRepResult[];
  // Tapping a push-up jumps the video to it.
  onSelectRep: (rep: PushupRepResult) => void;
};

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

// "Elbows 72° at the bottom", or the bottom time when depth wasn't graded (side view).
function describeBottom(rep: PushupRepResult): string {
  return rep.bottomElbowAngle === null
    ? `Bottom at ${formatSeconds(rep.bottomSeconds)}`
    : `Elbows ${Math.round(rep.bottomElbowAngle)}° at the bottom`;
}

// One tappable row per push-up: number, depth badge, elbow angle at the bottom.
export function PushupRepList({ reps, onSelectRep }: PushupRepListProps) {
  return (
    <ol className="space-y-2">
      {reps.map((rep) => (
        <li key={rep.repNumber}>
          <button
            type="button"
            onClick={() => onSelectRep(rep)}
            aria-label={`Push-up ${rep.repNumber}: ${rep.depthFeedback.text}, ${describeBottom(rep)}. Play from ${formatSeconds(rep.startSeconds)}.`}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-900 p-3 text-left active:bg-neutral-800"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg font-bold tabular-nums">
              {rep.repNumber}
            </span>
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex flex-wrap gap-1.5">
                <FeedbackBadge feedback={rep.depthFeedback} />
              </span>
              <span className="block text-sm text-neutral-400 tabular-nums">{describeBottom(rep)}</span>
            </span>
            <span aria-hidden="true" className="text-neutral-500">
              ▶
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
