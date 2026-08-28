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
    // Stated rather than inherited. Create React App targeted a browserslist
    // query; dropping it would have silently handed that decision to Vite's
    // default. These are the versions that support the syntax shipped here,
    // and they are what the app is tested against.
    target: ["chrome107", "edge107", "firefox104", "safari16"],
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
