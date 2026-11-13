import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import type { HealthResponse } from "@/types/health";


// Fetches the server's health status.
export async function getHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>("/health");
  return response.data;
}

// Polls the health endpoint so the header status dot stays current.
export function useHealthQuery() {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: 1,
  });
}
