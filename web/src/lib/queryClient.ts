import { QueryClient } from "@tanstack/react-query";

// One QueryClient for the whole app, shared through QueryClientProvider.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid surprise refetches when switching back to the tab mid-workout.
      refetchOnWindowFocus: false,
    },
  },
});
