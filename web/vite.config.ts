import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // '@/...' resolves to src/ (kept in sync with "paths" in tsconfig.app.json).
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // In development, forward /api requests to the local FastAPI server.
  // This mirrors the production Nginx setup, so the server needs no CORS config.
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
