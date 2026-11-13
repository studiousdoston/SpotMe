import axios from "axios";

// Shared HTTP client for every backend call.
// Relative '/api' works in dev (Vite proxy) and in production (Nginx).
export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 15_000,
});
