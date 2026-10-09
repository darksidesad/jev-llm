import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Browser calls /api; the Hono backend owns OPENROUTER_KEY on port 3001.
  server: { proxy: { "/api": "http://localhost:3001" } },
});
