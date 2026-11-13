import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In development, forward /api requests to the local FastAPI server.
  // This mirrors the production Nginx setup, so the server needs no CORS config.
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
