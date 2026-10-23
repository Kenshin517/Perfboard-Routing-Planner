import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-test config. Boots the production build and runs the specs in e2e/.
 * First run locally: `npx playwright install chromium`, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Static export has no Node server; build then serve out/ statically.
    command: "npm run build && npx --yes serve out -l 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
