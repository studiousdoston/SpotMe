import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { WorkoutSessionProvider } from "@/components/WorkoutSessionProvider";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/router";
import "@/index.css";

// Mount the app: React Query for server state, the workout session shared by
// Upload and Results (above the router, so navigation keeps it), React Router for pages.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WorkoutSessionProvider>
        <RouterProvider router={router} />
      </WorkoutSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
