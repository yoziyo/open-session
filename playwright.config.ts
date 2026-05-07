import { defineConfig, devices } from "@playwright/test";

const samplePort = 3100;
const viewerPort = 3101;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${samplePort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `pnpm --filter @open-session/sample-next exec next dev -p ${samplePort}`,
      url: `http://127.0.0.1:${samplePort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @open-session/viewer exec vite --host 127.0.0.1 --port ${viewerPort}`,
      url: `http://127.0.0.1:${viewerPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

export const ports = { samplePort, viewerPort };
