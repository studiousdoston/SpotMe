// Non-blocking advice from the server (the result is still shown), in an amber box.
export function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <ul className="space-y-1 text-amber-100">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
