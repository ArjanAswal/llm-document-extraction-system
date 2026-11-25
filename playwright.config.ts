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
  webServer: {
    command: "node tests/e2e/start-services.mjs",
    url: "http://127.0.0.1:3000/health/ready",
    reuseExistingServer: false,
  },
});
