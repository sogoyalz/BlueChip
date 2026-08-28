// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // The deployment already sets REACT_APP_* in Netlify and in the E2E harness.
  // Exposing that prefix alongside Vite's own means the move off Create React
  // App needs no change to any environment anywhere.
  envPrefix: ["VITE_", "REACT_APP_"],

  build: {
    // netlify.toml publishes "build"; keeping the directory name means the
    // deploy config, the E2E harness and the docs all stay correct.
    outDir: "build",
    sourcemap: true,
  },

  server: { port: 3000 },
  preview: { port: 3000 },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: false,
  },
});
