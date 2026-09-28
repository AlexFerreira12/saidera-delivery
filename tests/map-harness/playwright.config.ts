import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 30_000,
  testDir: ".",
  testMatch: "map.spec.ts",
  use: { baseURL: "http://127.0.0.1:4174" },
  webServer: {
    command: "bunx vite --config tests/map-harness/vite.config.ts",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  reporter: "line",
});
