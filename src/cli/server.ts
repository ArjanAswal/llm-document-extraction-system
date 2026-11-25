#!/usr/bin/env node
import "dotenv/config";
import { loadAppConfig } from "../services/app-config.js";
import { createDatabase } from "../services/sqlite-database.js";
import { SqliteStore } from "../services/sqlite-store.js";
import { AuthService } from "../services/auth-service.js";
import { FileDocumentStore } from "../services/document-store.js";
import { createHttpServer } from "../services/http-server.js";

async function main(): Promise<void> {
  const config = loadAppConfig();
  const store = new SqliteStore(
    createDatabase(config.dataDir),
    config.retryMaxAttempts,
  );
  const documents = new FileDocumentStore(
    config.dataDir,
    config.maxUploadBytes,
  );
  const auth = new AuthService(
    store,
    process.env.APP_ORIGIN ?? `http://localhost:${config.apiPort}`,
  );
  const server = createHttpServer({
    store,
    auth,
    documents,
    jobs: store,
    queue: store,
    dataDir: config.dataDir,
    maxUploadBytes: config.maxUploadBytes,
    staleWorkerMs: config.staleMs,
    sseHeartbeatMs: config.sseHeartbeatMs,
    appEnv: config.appEnv,
  });
  server.listen(config.apiPort, process.env.API_HOST ?? "127.0.0.1", () => {
    console.log(`API listening on http://${process.env.API_HOST ?? "127.0.0.1"}:${config.apiPort}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
