import { FeedbackBadge } from "@/components/FeedbackBadge";
import type { SquatRepResult } from "@/types/analysis";

type RepListProps = {
  reps: SquatRepResult[];
  // Tapping a rep jumps the video to it.
  onSelectRep: (rep: SquatRepResult) => void;
};

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

// One tappable row per rep: number, depth + tempo badges, down/up time.
export function RepList({ reps, onSelectRep }: RepListProps) {
  return (
    <ol className="space-y-2">
      {reps.map((rep) => (
        <li key={rep.repNumber}>
          <button
            type="button"
            onClick={() => onSelectRep(rep)}
            aria-label={`Rep ${rep.repNumber}: ${rep.depthFeedback.text}, ${rep.tempoFeedback.text}. Play from ${formatSeconds(rep.startSeconds)}.`}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-900 p-3 text-left active:bg-neutral-800"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg font-bold tabular-nums">
              {rep.repNumber}
            </span>
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex flex-wrap gap-1.5">
                <FeedbackBadge feedback={rep.depthFeedback} />
                <FeedbackBadge feedback={rep.tempoFeedback} />
              </span>
              <span className="block text-sm text-neutral-400 tabular-nums">
                Down {formatSeconds(rep.downSeconds)} · Up {formatSeconds(rep.upSeconds)}
              </span>
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
