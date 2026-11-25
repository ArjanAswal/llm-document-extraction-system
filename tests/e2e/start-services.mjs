import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataDir = path.join(root, ".e2e-data");
await fs.rm(dataDir, { recursive: true, force: true });

const baseEnv = {
  ...process.env,
  DATA_DIR: dataDir,
  APP_ENV: "development",
  API_PORT: "3000",
  OUTBOX_ENCRYPTION_KEY:
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
};
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const worker = spawn(tsx, ["src/cli/worker.ts"], {
  cwd: root,
  env: { ...baseEnv, WORKER_EXTRACTOR: "fixture" },
  stdio: "inherit",
});
const server = spawn(tsx, ["src/cli/server.ts"], {
  cwd: root,
  env: baseEnv,
  stdio: "inherit",
});

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  worker.kill(signal);
  server.kill(signal);
  setTimeout(() => process.exit(0), 500);
}

worker.on("exit", (code) => {
  if (!stopping) {
    console.error(`worker exited unexpectedly: ${code}`);
    stop();
  }
});
server.on("exit", (code) => {
  if (!stopping) {
    console.error(`server exited unexpectedly: ${code}`);
    stop();
  }
});
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
