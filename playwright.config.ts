import { defineConfig } from "@playwright/test";
import fs from "fs";

const installedChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const executablePath =
  installedChromium ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find((candidate) =>
    fs.existsSync(candidate),
  );

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    {
      command: "npm run server",
      env: {
        APP_ENV: "development",
        DATA_DIR: ".e2e-data",
        OUTBOX_ENCRYPTION_KEY:
          "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        API_PORT: "3000",
      },
      url: "http://127.0.0.1:3000/health/ready",
      reuseExistingServer: false,
    },
    {
      command: "npm run worker",
      env: {
        DATA_DIR: ".e2e-data",
        WORKER_EXTRACTOR: "fixture",
        JOB_LEASE_MS: "10000",
        WORKER_HEARTBEAT_MS: "1000",
      },
      reuseExistingServer: false,
    },
  ],
});
