import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Vite reads .env from the Vite project root (frontend/) by default, but
  // this repo keeps ONE .env at the repository root that both the backend and
  // the frontend read. Without envDir the VITE_* values there were silently
  // ignored and the app always used the hardcoded fallback URLs.
  envDir: path.resolve(__dirname, ".."),
  resolve: {
    // Mirrors tsconfig.json's "paths": { "@/*": ["src/*"] } — tsconfig only
    // affects type-checking, so without this the bundler can't resolve any
    // "@/..." import used throughout the app, breaking both dev and build.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
