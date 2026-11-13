import { useHealthQuery } from "@/api/health";

export function ServerStatusDot() {
  const healthQuery = useHealthQuery();

  let dotColorClass: string;
  let statusLabel: string;
  if (healthQuery.isPending) {
    dotColorClass = "bg-neutral-500";
    statusLabel = "Checking server";
  } else if (healthQuery.isSuccess && healthQuery.data.status === "ok") {
    dotColorClass = "bg-green-500";
    statusLabel = "Server: ok";
  } else {
    dotColorClass = "bg-red-500";
    statusLabel = "Server: not reachable";
  }

  return (
    <span
      role="status"
      title={statusLabel}
      aria-label={statusLabel}
      className={`inline-block size-2.5 rounded-full ${dotColorClass}`}
    />
  );
}
