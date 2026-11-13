import { Link } from "react-router";

// Shown for any URL that doesn't match a route.
export function NotFoundPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-neutral-400">That page doesn't exist.</p>
      <Link
        to="/"
        className="inline-block rounded-md bg-accent px-4 py-2 font-medium text-neutral-950"
      >
        Back to upload
      </Link>
    </section>
  );
}
