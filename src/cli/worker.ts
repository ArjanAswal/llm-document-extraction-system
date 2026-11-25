#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "crypto";
import { loadAppConfig } from "../services/app-config.js";
import { createDatabase } from "../services/sqlite-database.js";
import { SqliteStore } from "../services/sqlite-store.js";
import { FileDocumentStore } from "../services/document-store.js";
import { JobWorker } from "../services/job-worker.js";
import { FixtureInvoiceExtractor } from "../services/fixture-invoice-extractor.js";
import { createPdfTextExtractor } from "../services/pdf-text-extractor.js";
import { createLanguageDetector } from "../services/language-detector.js";
import { createCsvWriter } from "../services/csv-writer.js";
import { createInvoiceExtractor } from "../services/invoice-extractor.js";

async function main(): Promise<void> {
  const config = loadAppConfig();
  if (config.workerExtractor === "gemini" && !process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required when WORKER_EXTRACTOR=gemini");
  }
  const store = new SqliteStore(
    createDatabase(config.dataDir),
    config.retryMaxAttempts,
  );
  const workerId = process.env.WORKER_ID ?? randomUUID();
  const documents = new FileDocumentStore(
    config.dataDir,
    config.maxUploadBytes,
  );
  const worker = new JobWorker(
    store,
    store,
    documents,
    {
      textExtractor: createPdfTextExtractor(),
      languageDetector: createLanguageDetector(),
      invoiceExtractor:
        config.workerExtractor === "fixture"
          ? new FixtureInvoiceExtractor()
          : createInvoiceExtractor(),
      outputWriter: createCsvWriter(),
    },
    {
      workerId,
      dataDir: config.dataDir,
      pollIntervalMs: 500,
      leaseMs: config.leaseMs,
      heartbeatMs: config.heartbeatMs,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
    },
  );

  const heartbeat = setInterval(() => {
    store.recordWorkerHeartbeat(workerId, config.workerExtractor, Date.now());
  }, Math.max(500, config.heartbeatMs));
  store.recordWorkerHeartbeat(workerId, config.workerExtractor, Date.now());
  worker.start();
  console.log(`Worker ${workerId} started (${config.workerExtractor})`);

  const shutdown = async () => {
    clearInterval(heartbeat);
    await worker.stop();
    store.clearWorkerHeartbeat(workerId);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
