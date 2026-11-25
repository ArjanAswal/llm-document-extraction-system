import path from "path";

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

export interface AppConfig {
  dataDir: string;
  apiPort: number;
  maxUploadBytes: number;
  leaseMs: number;
  heartbeatMs: number;
  staleMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryMaxAttempts: number;
  sseHeartbeatMs: number;
  workerExtractor: "gemini" | "fixture";
  appEnv: string;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const workerExtractor = (env.WORKER_EXTRACTOR ?? "gemini") as "gemini" | "fixture";
  if (workerExtractor !== "gemini" && workerExtractor !== "fixture") {
    throw new Error("WORKER_EXTRACTOR must be gemini or fixture");
  }
  const dataDir = path.resolve(env.DATA_DIR ?? path.join(process.cwd(), "data"));
  return {
    dataDir,
    apiPort: integer("API_PORT", 3000),
    maxUploadBytes: integer("MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
    leaseMs: integer("JOB_LEASE_MS", 30_000),
    heartbeatMs: integer("WORKER_HEARTBEAT_MS", 5_000),
    staleMs: integer("WORKER_STALE_MS", 15_000),
    retryBaseDelayMs: integer("RETRY_BASE_DELAY_MS", 1_000),
    retryMaxDelayMs: integer("RETRY_MAX_DELAY_MS", 30_000),
    retryMaxAttempts: integer("RETRY_MAX_ATTEMPTS", 5),
    sseHeartbeatMs: integer("SSE_HEARTBEAT_MS", 15_000),
    workerExtractor,
    appEnv: env.APP_ENV ?? "development",
  };
}
