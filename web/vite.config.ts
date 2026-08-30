import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

const projectRoot = path.join(here, "..");

export default defineConfig({
  // Vite's root defaults to cwd, which is the repo root when run via npm.
  root: here,
  plugins: [react()],
  // Narration and manifests come from the API server, not from a public/ copy,
  // so a build never has to bundle every generated project.
  publicDir: false,
  // Tells src/remotion/theme.ts to skip the 5.1MB webfont download and use the
  // device's own Japanese face instead.
  define: { __STUDY_WEB__: "true" },
  server: {
    port: 5173,
    // The Remotion composition lives in ../src and is imported directly.
    fs: { allow: [projectRoot] },
    proxy: {
      "/api": "http://localhost:3001",
      // staticFile() resolves to /projects/... — same path in dev and prod.
      "/projects": "http://localhost:3001",
    },
  },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true },
});
