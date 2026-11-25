import fs from "fs/promises";
import { renameSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { InvoiceRecordSchema } from "../domain/invoice.schema.js";
import type { InvoiceRecord } from "../domain/invoice.types.js";
import type { PipelineDeps } from "./pipeline.js";
import { processInvoiceFile } from "./pipeline.js";
import type { JobStorePort } from "../ports/job-store.port.js";
import type { QueuePort } from "../ports/queue.port.js";
import type { DocumentStorePort } from "../ports/document-store.port.js";
import { createCsvWriter } from "./csv-writer.js";

export interface JobWorkerOptions {
  workerId: string;
  dataDir: string;
  pollIntervalMs: number;
  leaseMs: number;
  heartbeatMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export class JobWorker {
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly queue: QueuePort,
    private readonly jobs: JobStorePort,
    private readonly documents: DocumentStorePort,
    private readonly deps: PipelineDeps,
    private readonly options: JobWorkerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.pollIntervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.busy) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async tick(): Promise<void> {
    if (this.stopping || this.busy) return;
    this.busy = true;
    try {
      this.queue.recoverExpired(Date.now());
      const lease = this.queue.claimNext(
        this.options.workerId,
        Date.now(),
        this.options.leaseMs,
      );
      if (!lease) return;
      try {
        await this.processLease(lease.job.id, lease.job.ownerUserId, lease.token);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryAt = this.retryAt(lease.job.attempt + 1);
        this.queue.fail(lease.job.id, lease.token, message, retryAt);
      }
    } finally {
      this.busy = false;
    }
  }

  private async processLease(
    jobId: string,
    ownerUserId: string,
    leaseToken: string,
  ): Promise<void> {
    const heartbeat = setInterval(() => {
      if (
        !this.queue.heartbeat(
          jobId,
          leaseToken,
          Date.now(),
          this.options.leaseMs,
        )
      ) {
        clearInterval(heartbeat);
      }
    }, this.options.heartbeatMs);
    heartbeat.unref?.();
    try {
      const owned = this.jobs.getOwnedJob(jobId, ownerUserId);
      if (!owned) throw new Error("Job is no longer accessible");

      for (const document of owned.documents) {
        if (document.state === "succeeded") continue;
        if (
          !this.jobs.markDocumentProcessing(
            jobId,
            document.id,
            ownerUserId,
            leaseToken,
          )
        ) {
          throw new Error("Lease was lost while processing document");
        }

        const bytes = await this.documents.readPath(document.storagePath);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== document.sha256) {
          this.jobs.saveDocumentFailure(
            jobId,
            document.id,
            ownerUserId,
            leaseToken,
            "Snapshot hash mismatch",
          );
          throw new Error(`Snapshot hash mismatch: ${document.sourceFile}`);
        }

        let record: InvoiceRecord;
        try {
          record = await processInvoiceFile(document.storagePath, this.deps);
        } catch (error) {
          this.jobs.saveDocumentFailure(
            jobId,
            document.id,
            ownerUserId,
            leaseToken,
            error instanceof Error ? error.message : String(error),
          );
          throw error;
        }
        if (
          !this.jobs.saveDocumentResult(
            jobId,
            document.id,
            ownerUserId,
            leaseToken,
            record,
          )
        ) {
          throw new Error("Lease was lost while saving document result");
        }
      }

      const completed = this.jobs
        .getDocuments(jobId)
        .map((document) => InvoiceRecordSchema.parse(document.record));
      await this.publish(jobId, ownerUserId, leaseToken, completed);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async publish(
    jobId: string,
    ownerUserId: string,
    leaseToken: string,
    records: InvoiceRecord[],
  ): Promise<void> {
    if (!this.queue.beginPublication(jobId, leaseToken)) {
      throw new Error("Job no longer permits publication");
    }
    const outputDirectory = path.join(this.options.dataDir, "outputs");
    await fs.mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${jobId}.csv`);
    const stagedPath = `${outputPath}.${leaseToken}.tmp`;
    await createCsvWriter().writeRecords(stagedPath, records);
    const bytes = await fs.readFile(stagedPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const committed = this.jobs.commitPublication(
      jobId,
      ownerUserId,
      leaseToken,
      outputPath,
      sha256,
      () => {
        renameSync(stagedPath, outputPath);
      },
    );
    if (!committed) {
      await fs.rm(stagedPath, { force: true });
      throw new Error("Publication was fenced");
    }
    if (!this.queue.complete(jobId, leaseToken)) {
      throw new Error("Job completion was fenced");
    }
  }

  private retryAt(attempt: number): number | null {
    const delay = Math.min(
      this.options.retryMaxDelayMs,
      this.options.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    return Date.now() + delay;
  }
}
