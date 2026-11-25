import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCsvWriter } from "../../src/services/csv-writer.js";
import { FileDocumentStore } from "../../src/services/document-store.js";
import { FixtureInvoiceExtractor } from "../../src/services/fixture-invoice-extractor.js";
import { JobWorker } from "../../src/services/job-worker.js";
import { createDatabase } from "../../src/services/sqlite-database.js";
import { SqliteStore } from "../../src/services/sqlite-store.js";

const PDF_BYTES = Buffer.from("%PDF-1.7\nfixture\n%%EOF");

describe("JobWorker", () => {
  let tempDir: string;
  let store: SqliteStore;
  let documents: FileDocumentStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-worker-"));
    store = new SqliteStore(createDatabase(tempDir), 5);
    documents = new FileDocumentStore(tempDir, 1024 * 1024);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("processes a durable job and publishes a receipt once", async () => {
    const user = store.createUser("owner@example.test", "hash", "salt");
    const upload = await documents.stage([
      { originalName: "invoice_01_electricity.pdf", bytes: PDF_BYTES },
    ]);
    await documents.commit(upload);
    const job = store.createJob(
      user.id,
      upload.jobId,
      upload.documents.map((document) => ({
        sourceFile: document.sourceFile,
        storagePath: document.storagePath,
        sha256: document.sha256,
      })),
    );
    const worker = createWorker(store, documents, tempDir);

    await worker.tick();

    const owned = store.getOwnedJob(job.id, user.id)!;
    expect(owned.job.state).toBe("succeeded");
    expect(owned.documents[0]!.state).toBe("succeeded");
    const receipt = store.getReceipt(job.id, user.id)!;
    expect(receipt.sha256).toHaveLength(64);
    const csv = await fs.readFile(receipt.outputPath, "utf8");
    expect(csv).toContain("vendor_name,invoice_date");
    expect(csv).toContain("Fixture Electric Utility");

    await worker.tick();
    expect(store.getOwnedJob(job.id, user.id)!.job.state).toBe("succeeded");
  });
});

function createWorker(
  store: SqliteStore,
  documents: FileDocumentStore,
  tempDir: string,
): JobWorker {
  return new JobWorker(
    store,
    store,
    documents,
    {
      textExtractor: {
        extractText: vi.fn().mockResolvedValue("fixture invoice text"),
      },
      languageDetector: {
        detectLanguage: vi.fn().mockReturnValue({ code: "en", confidence: 1 }),
      },
      invoiceExtractor: new FixtureInvoiceExtractor(),
      outputWriter: createCsvWriter(),
    },
    {
      workerId: "test-worker",
      dataDir: tempDir,
      pollIntervalMs: 25,
      leaseMs: 1_000,
      heartbeatMs: 100,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 10,
    },
  );
}
