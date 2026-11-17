import { lazy, Suspense } from "react";

// The Results page (and its charts library) loads in its own chunk, only when it's opened,
// so the first page load on a phone stays small.
const ResultsPage = lazy(() =>
  import("@/pages/ResultsPage").then((resultsModule) => ({ default: resultsModule.ResultsPage })),
);

// Route component for /results: a short loading line while the chunk downloads.
export function LazyResultsPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading results…</p>}>
      <ResultsPage />
    </Suspense>
  );
}
