import { useEffect, useState } from "react";

// Shape of the JSON returned by GET /api/health.
type HealthResponse = {
  status: string;
};

type ServerStatus =
  | { kind: "loading" }
  | { kind: "reachable"; status: string }
  | { kind: "unreachable" };

function App() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    kind: "loading",
  });

  useEffect(() => {
    const abortController = new AbortController();

    async function checkServerHealth(): Promise<void> {
      try {
        const response = await fetch("/api/health", {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Health check failed with HTTP ${response.status}`);
        }
        const healthResponse = (await response.json()) as HealthResponse;
        setServerStatus({ kind: "reachable", status: healthResponse.status });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setServerStatus({ kind: "unreachable" });
      }
    }

    void checkServerHealth();

    return () => abortController.abort();
  }, []);

  let serverStatusText: string;
  if (serverStatus.kind === "loading") {
    serverStatusText = "Server: checking...";
  } else if (serverStatus.kind === "reachable") {
    serverStatusText = `Server: ${serverStatus.status}`;
  } else {
    serverStatusText = "Server: not reachable";
  }

  return (
    <main>
      <h1>SpotMe</h1>
      <p>{serverStatusText}</p>
    </main>
  );
}

export default App;
