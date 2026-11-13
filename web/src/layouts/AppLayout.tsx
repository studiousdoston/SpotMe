import { NavLink, Outlet } from "react-router";
import { ServerStatusDot } from "@/components/ServerStatusDot";

// Header nav entries.
const navigationLinks = [
  { path: "/", label: "Upload" },
  { path: "/history", label: "History" },
];

// Shared shell for every page: sticky header on top, page content below.
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header: logo, nav links, server status */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <NavLink to="/" className="text-lg font-bold tracking-tight">
            Spot<span className="text-accent">Me</span>
          </NavLink>

          <nav className="ml-auto flex items-center gap-1">
            {navigationLinks.map((navigationLink) => (
              <NavLink
                key={navigationLink.path}
                to={navigationLink.path}
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-accent"
                      : "text-neutral-400 hover:text-neutral-100"
                  }`
                }
              >
                {navigationLink.label}
              </NavLink>
            ))}
          </nav>

          <ServerStatusDot />
        </div>
      </header>

      {/* Page content for the current route */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
