/**
 * Playwright config for remote/production testing.
 * Targets the live Vercel deployment at https://dataspace-v2.vercel.app.
 *
 * Run:
 *   npx playwright test --config=playwright-remote.config.ts e2e/cnc-press-sidecar.spec.ts
 *
 * Prerequisites (all must be running locally):
 *   - Sidecar proxy:  npm run dev  (api-equipment/sidecar-proxy)  → localhost:3100
 *   - CNC equipment:  npm run dev  (api-equipment/cnc)            → 192.168.0.70:3001
 *   - Press equipment:npm run dev  (api-equipment/press)          → 192.168.0.168:3002
 */
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-remote" }]],
  use: {
    baseURL: "https://dataspace-v2.vercel.app",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
})
