import { createBrowserRouter } from "react-router";
import { AppLayout } from "@/layouts/AppLayout";
import { HistoryPage } from "@/pages/HistoryPage";
import { LazyResultsPage } from "@/pages/LazyResultsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UploadPage } from "@/pages/UploadPage";

// App routes. Every page renders inside AppLayout's <Outlet />.
// Results is lazy-loaded (see LazyResultsPage) to keep the charts out of the first bundle.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: UploadPage },
      { path: "results", Component: LazyResultsPage },
      { path: "history", Component: HistoryPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
