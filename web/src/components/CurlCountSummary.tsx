import { ARM_NAMES, ARM_SIDES, countFullCurls, formatArmCount } from "@/lib/curlArms";
import type { CurlAnalysisResult } from "@/types/analysis";

// Big per-arm count ("Left 5 · Right 5") plus a "8/10 full curls" chip.
export function CurlCountSummary({ analysis }: { analysis: CurlAnalysisResult }) {
  const { fullCount, totalCount } = countFullCurls(analysis);

  return (
    <div className="space-y-3">
      <p className="text-4xl font-bold tracking-tight">
        {ARM_SIDES.map((armSide) => `${ARM_NAMES[armSide]} ${formatArmCount(analysis.arms[armSide])}`).join(" · ")}
      </p>

      {totalCount > 0 ? (
        <ul className="flex flex-wrap gap-2">
          <li className="rounded-full bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200">
            {fullCount}/{totalCount} full curls
          </li>
        </ul>
      ) : (
        <p className="text-neutral-400">No curls found. Make sure every curl is fully in the video.</p>
      )}
    </div>
  );
}
