import { createBrowserRouter } from "react-router";
import { AppLayout } from "@/layouts/AppLayout";
import { HistoryPage } from "@/pages/HistoryPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ResultsPage } from "@/pages/ResultsPage";
import { UploadPage } from "@/pages/UploadPage";

// App routes. Every page renders inside AppLayout's <Outlet />.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: UploadPage },
      { path: "results", Component: ResultsPage },
      { path: "history", Component: HistoryPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
