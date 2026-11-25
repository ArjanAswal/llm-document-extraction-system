import { randomUUID } from "crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  AuthStorePort,
  CredentialRecord,
  OutboxMessage,
  SessionRecord,
} from "../ports/auth-store.port.js";
import type {
  JobReceipt,
  JobStorePort,
  JobWithDocuments,
  JobEvent,
  NewJobDocument,
} from "../ports/job-store.port.js";
import type { Lease, QueuePort } from "../ports/queue.port.js";
import type { Session, User } from "../domain/auth.schema.js";
import type { InvoiceRecord } from "../domain/invoice.types.js";
import type {
  Job,
  JobDocument,
  JobState,
} from "../domain/job.schema.js";
import { transaction } from "./sqlite-database.js";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Invalid database value for ${key}`);
  return value;
}

function nullableText(row: Row, key: string): string | null {
  const value = row[key];
  return value === null ? null : text(row, key);
}

function integer(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid database value for ${key}`);
  }
  return value;
}

function nullableInteger(row: Row, key: string): number | null {
  const value = row[key];
  return value === null ? null : integer(row, key);
}

function mapUser(row: Row): User {
  return {
    id: text(row, "id"),
    email: text(row, "email"),
    active: integer(row, "active") === 1,
    deletedAt: nullableInteger(row, "deleted_at"),
  };
}

function mapCredential(row: Row): CredentialRecord {
  return {
    ...mapUser(row),
    passwordHash: text(row, "password_hash"),
    passwordSalt: text(row, "password_salt"),
  };
}

function mapSession(row: Row): SessionRecord {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    tokenHash: text(row, "token_hash"),
    expiresAt: integer(row, "expires_at"),
    revokedAt: nullableInteger(row, "revoked_at"),
  };
}

function mapJob(row: Row): Job {
  return {
    id: text(row, "id"),
    ownerUserId: text(row, "owner_user_id"),
    state: text(row, "state") as Job["state"],
    attempt: integer(row, "attempt"),
    maxAttempts: integer(row, "max_attempts"),
    createdAt: integer(row, "created_at"),
    updatedAt: integer(row, "updated_at"),
    nextAttemptAt: integer(row, "next_attempt_at"),
    cancelRequested: integer(row, "cancel_requested") === 1,
    workerId: nullableText(row, "worker_id"),
    leaseToken: nullableText(row, "lease_token"),
    leaseExpiresAt: nullableInteger(row, "lease_expires_at"),
    error: nullableText(row, "error"),
    outputPath: nullableText(row, "output_path"),
    receiptHash: nullableText(row, "receipt_hash"),
  };
}

function mapDocument(row: Row): JobDocument {
  const recordRaw = nullableText(row, "record_json");
  return {
    id: text(row, "id"),
    jobId: text(row, "job_id"),
    sourceFile: text(row, "source_file"),
    storagePath: text(row, "storage_path"),
    sha256: text(row, "sha256"),
    state: text(row, "state") as JobDocument["state"],
    record: recordRaw === null ? null : JSON.parse(recordRaw),
    error: nullableText(row, "error"),
  };
}

function mapEvent(row: Row): JobEvent {
  return {
    id: integer(row, "id"),
    jobId: text(row, "job_id"),
    ownerUserId: text(row, "owner_user_id"),
    type: text(row, "type"),
    payload: JSON.parse(text(row, "payload_json")),
    createdAt: integer(row, "created_at"),
  };
}

function mapOutbox(row: Row): OutboxMessage {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    kind: text(row, "kind") as "password_reset",
    encryptedPayload: text(row, "encrypted_payload"),
    tokenHash: text(row, "token_hash"),
    expiresAt: integer(row, "expires_at"),
    createdAt: integer(row, "created_at"),
  };
}

export class SqliteStore implements AuthStorePort, JobStorePort, QueuePort {
  constructor(
    private readonly db: DatabaseSync,
    private readonly maxAttempts = 5,
  ) {}

  createUser(email: string, passwordHash: string, passwordSalt: string): User {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, active)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(id, email, passwordHash, passwordSalt);
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!row) throw new Error("Failed to create user");
    return mapUser(row as Row);
  }

  findUserByEmail(email: string): CredentialRecord | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);
    return row ? mapCredential(row as Row) : null;
  }

  findUserById(id: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return row ? mapUser(row as Row) : null;
  }

  updatePassword(userId: string, passwordHash: string, passwordSalt: string): void {
    const result = this.db
      .prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?
         WHERE id = ? AND active = 1`,
      )
      .run(passwordHash, passwordSalt, userId);
    if (Number(result.changes) !== 1) throw new Error("Active user not found");
  }

  deleteUser(userId: string, now: number): void {
    transaction(this.db, () => {
      this.db
        .prepare("UPDATE users SET active = 0, deleted_at = ? WHERE id = ?")
        .run(now, userId);
      this.revokeUserSessions(userId, now);
      this.markOwnedJobsCancelled(userId);
      this.appendSystemEvent(userId, "account.deleted", { userId }, now);
    });
  }

  createSession(userId: string, tokenHash: string, expiresAt: number): Session {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, userId, tokenHash, expiresAt);
    return { id, userId, expiresAt };
  }

  findSession(tokenHash: string, now: number): SessionRecord | null {
    const row = this.db
      .prepare(
        `SELECT sessions.*
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?
           AND sessions.revoked_at IS NULL
           AND sessions.expires_at > ?
           AND users.active = 1`,
      )
      .get(tokenHash, now);
    return row ? mapSession(row as Row) : null;
  }

  revokeSession(tokenHash: string, now: number): void {
    this.db
      .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
      .run(now, tokenHash);
  }

  revokeUserSessions(userId: string, now: number): void {
    this.db
      .prepare(
        `UPDATE sessions SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .run(now, userId);
  }

  createPasswordReset(
    userId: string,
    tokenHash: string,
    encryptedPayload: string,
    expiresAt: number,
  ): OutboxMessage {
    const now = Date.now();
    return transaction(this.db, () => {
      const resetId = randomUUID();
      const outboxId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO password_resets
           (id, user_id, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(resetId, userId, tokenHash, expiresAt, now);
      this.db
        .prepare(
          `INSERT INTO email_outbox
           (id, user_id, kind, encrypted_payload, token_hash, expires_at, created_at)
           VALUES (?, ?, 'password_reset', ?, ?, ?, ?)`,
        )
        .run(outboxId, userId, encryptedPayload, tokenHash, expiresAt, now);
      return {
        id: outboxId,
        userId,
        kind: "password_reset",
        encryptedPayload,
        tokenHash,
        expiresAt,
        createdAt: now,
      };
    });
  }

  consumePasswordReset(tokenHash: string, now: number): OutboxMessage | null {
    return transaction(this.db, () => {
      const reset = this.db
        .prepare(
          `SELECT * FROM password_resets
           WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
        )
        .get(tokenHash, now);
      if (!reset) return null;
      const id = text(reset as Row, "id");
      this.db
        .prepare("UPDATE password_resets SET consumed_at = ? WHERE id = ?")
        .run(now, id);
      const outbox = this.db
        .prepare("SELECT * FROM email_outbox WHERE token_hash = ?")
        .get(tokenHash);
      return outbox ? mapOutbox(outbox as Row) : null;
    });
  }

  findOutboxMessage(id: string): OutboxMessage | null {
    const row = this.db
      .prepare("SELECT * FROM email_outbox WHERE id = ?")
      .get(id);
    return row ? mapOutbox(row as Row) : null;
  }

  createJob(ownerUserId: string, jobId: string, documents: NewJobDocument[]): Job {
    const now = Date.now();
    return transaction(this.db, () => {
      const user = this.findUserById(ownerUserId);
      if (!user?.active) throw new Error("User is not active");
      this.db
        .prepare(
          `INSERT INTO jobs
           (id, owner_user_id, state, max_attempts, created_at, updated_at, next_attempt_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?)`,
        )
        .run(jobId, ownerUserId, this.maxAttempts, now, now, now);
      const insertDocument = this.db.prepare(
        `INSERT INTO documents
         (id, job_id, owner_user_id, source_file, storage_path, sha256, state, position)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      );
      documents.forEach((document, position) => {
        insertDocument.run(
          randomUUID(),
          jobId,
          ownerUserId,
          document.sourceFile,
          document.storagePath,
          document.sha256,
          position,
        );
      });
      this.appendEvent(jobId, ownerUserId, "job.queued", { documentCount: documents.length });
      return this.requireJob(jobId);
    });
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    return row ? mapJob(row as Row) : null;
  }

  getOwnedJob(id: string, ownerUserId: string): JobWithDocuments | null {
    const jobRow = this.db
      .prepare("SELECT * FROM jobs WHERE id = ? AND owner_user_id = ?")
      .get(id, ownerUserId);
    if (!jobRow) return null;
    return {
      job: mapJob(jobRow as Row),
      documents: this.getDocuments(id),
    };
  }

  listOwnedJobs(ownerUserId: string): JobWithDocuments[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM jobs WHERE owner_user_id = ? ORDER BY created_at DESC",
      )
      .all(ownerUserId) as Row[];
    return rows.map((row) => ({
      job: mapJob(row),
      documents: this.getDocuments(text(row, "id")),
    }));
  }

  getDocuments(jobId: string): JobDocument[] {
    return (this.db
      .prepare("SELECT * FROM documents WHERE job_id = ? ORDER BY position")
      .all(jobId) as Row[]).map(mapDocument);
  }

  getPendingDocuments(jobId: string): JobDocument[] {
    return (this.db
      .prepare(
        `SELECT * FROM documents
         WHERE job_id = ? AND state IN ('pending','failed')
         ORDER BY position`,
      )
      .all(jobId) as Row[]).map(mapDocument);
  }

  markDocumentProcessing(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
  ): boolean {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE documents SET state = 'processing'
         WHERE id = ? AND job_id = ? AND owner_user_id = ?
           AND state IN ('pending','failed')
           AND EXISTS (
             SELECT 1 FROM jobs
             JOIN users ON users.id = jobs.owner_user_id
             WHERE jobs.id = ?
               AND jobs.owner_user_id = ?
               AND jobs.lease_token = ?
               AND jobs.lease_expires_at > ?
               AND jobs.state = 'running'
               AND jobs.cancel_requested = 0
               AND users.active = 1
           )`,
      )
      .run(documentId, jobId, ownerUserId, jobId, ownerUserId, leaseToken, now);
    return Number(result.changes) === 1;
  }

  saveDocumentResult(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
    record: InvoiceRecord,
  ): boolean {
    return transaction(this.db, () => {
      if (!this.leaseIsCurrent(jobId, ownerUserId, leaseToken)) return false;
      const result = this.db
        .prepare(
          `UPDATE documents
           SET state = 'succeeded', record_json = ?, error = NULL
           WHERE id = ? AND job_id = ? AND owner_user_id = ?`,
        )
        .run(JSON.stringify(record), documentId, jobId, ownerUserId);
      if (Number(result.changes) === 1) {
        this.appendEvent(jobId, ownerUserId, "document.succeeded", {
          documentId,
        });
      }
      return Number(result.changes) === 1;
    });
  }

  saveDocumentFailure(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
    message: string,
  ): boolean {
    return transaction(this.db, () => {
      if (!this.leaseIsCurrent(jobId, ownerUserId, leaseToken)) return false;
      const result = this.db
        .prepare(
          `UPDATE documents SET state = 'failed', error = ?
           WHERE id = ? AND job_id = ? AND owner_user_id = ?`,
        )
        .run(message, documentId, jobId, ownerUserId);
      if (Number(result.changes) === 1) {
        this.appendEvent(jobId, ownerUserId, "document.failed", {
          documentId,
          message,
        });
      }
      return Number(result.changes) === 1;
    });
  }

  appendEvent(jobId: string, ownerUserId: string, type: string, payload: unknown): JobEvent {
    const createdAt = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO job_events
         (job_id, owner_user_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(jobId, ownerUserId, type, JSON.stringify(payload), createdAt);
    return {
      id: Number(result.lastInsertRowid),
      jobId,
      ownerUserId,
      type,
      payload,
      createdAt,
    };
  }

  listEvents(jobId: string, ownerUserId: string, afterId: number): JobEvent[] {
    return (this.db
      .prepare(
        `SELECT * FROM job_events
         WHERE job_id = ? AND owner_user_id = ? AND id > ?
         ORDER BY id`,
      )
      .all(jobId, ownerUserId, afterId) as Row[]).map(mapEvent);
  }

  requestCancel(jobId: string, ownerUserId: string): JobState {
    return transaction(this.db, () => {
      const job = this.getOwnedJob(jobId, ownerUserId)?.job;
      if (!job) throw new Error("Job not found");
      if (job.state === "publishing" || job.state === "succeeded") {
        throw new Error("Job is already publishing or complete");
      }
      if (job.state === "cancelled") return job.state;
      const now = Date.now();
      this.db
        .prepare(
          `UPDATE jobs
           SET state = 'cancelled', cancel_requested = 1, lease_token = NULL,
               lease_expires_at = NULL, worker_id = NULL, updated_at = ?
           WHERE id = ? AND owner_user_id = ?`,
        )
        .run(now, jobId, ownerUserId);
      this.appendEvent(jobId, ownerUserId, "job.cancelled", {});
      return "cancelled";
    });
  }

  requestRetry(jobId: string, ownerUserId: string): Job {
    return transaction(this.db, () => {
      const owned = this.getOwnedJob(jobId, ownerUserId);
      if (!owned) throw new Error("Job not found");
      if (!["failed", "dead_letter"].includes(owned.job.state)) {
        throw new Error("Only failed jobs can be retried");
      }
      const now = Date.now();
      this.db
        .prepare(
          `UPDATE documents SET state = 'pending', error = NULL
           WHERE job_id = ? AND state = 'failed'`,
        )
        .run(jobId);
      this.db
        .prepare(
          `UPDATE jobs
           SET state = 'queued', next_attempt_at = ?, cancel_requested = 0,
               error = NULL, lease_token = NULL, lease_expires_at = NULL,
               worker_id = NULL, updated_at = ?
           WHERE id = ? AND owner_user_id = ?`,
        )
        .run(now, now, jobId, ownerUserId);
      this.appendEvent(jobId, ownerUserId, "job.retry_queued", {});
      return this.requireJob(jobId);
    });
  }

  markOwnedJobsCancelled(ownerUserId: string): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE jobs
         SET state = 'cancelled', cancel_requested = 1, lease_token = NULL,
             lease_expires_at = NULL, worker_id = NULL, updated_at = ?
         WHERE owner_user_id = ? AND state NOT IN ('succeeded','failed','dead_letter','cancelled')`,
      )
      .run(now, ownerUserId);
    return Number(result.changes);
  }

  recordWorkerHeartbeat(workerId: string, extractor: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO worker_heartbeats (worker_id, extractor, heartbeat_at)
         VALUES (?, ?, ?)
         ON CONFLICT(worker_id) DO UPDATE SET
           extractor = excluded.extractor,
           heartbeat_at = excluded.heartbeat_at`,
      )
      .run(workerId, extractor, now);
  }

  clearWorkerHeartbeat(workerId: string): void {
    this.db
      .prepare("DELETE FROM worker_heartbeats WHERE worker_id = ?")
      .run(workerId);
  }

  latestWorkerHeartbeat(): number | null {
    const row = this.db
      .prepare(
        "SELECT MAX(heartbeat_at) AS heartbeat_at FROM worker_heartbeats",
      )
      .get();
    if (!row || row.heartbeat_at === null || row.heartbeat_at === undefined) return null;
    const value = row.heartbeat_at;
    if (typeof value !== "number") return null;
    return value;
  }

  isDatabaseUsable(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  saveReceipt(receipt: JobReceipt): boolean {
    const now = Date.now();
    return transaction(this.db, () => {
      const job = this.getOwnedJob(receipt.jobId, receipt.ownerUserId)?.job;
      if (!job || job.state !== "publishing") return false;
      this.db
        .prepare(
          `INSERT INTO receipts (job_id, owner_user_id, output_path, sha256, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET
             output_path = excluded.output_path,
             sha256 = excluded.sha256,
             created_at = excluded.created_at`,
        )
        .run(
          receipt.jobId,
          receipt.ownerUserId,
          receipt.outputPath,
          receipt.sha256,
          receipt.createdAt,
        );
      this.db
        .prepare(
          `UPDATE jobs
           SET output_path = ?, receipt_hash = ?, updated_at = ?
           WHERE id = ? AND owner_user_id = ?`,
        )
        .run(receipt.outputPath, receipt.sha256, now, receipt.jobId, receipt.ownerUserId);
      return true;
    });
  }

  commitPublication(
    jobId: string,
    ownerUserId: string,
    leaseToken: string,
    outputPath: string,
    sha256: string,
    install: () => void,
  ): boolean {
    const now = Date.now();
    return transaction(this.db, () => {
      const job = this.getJob(jobId);
      const activeOwner = this.db
        .prepare("SELECT active FROM users WHERE id = ?")
        .get(ownerUserId) as Row | undefined;
      if (
        !job ||
        job.ownerUserId !== ownerUserId ||
        job.leaseToken !== leaseToken ||
        job.state !== "publishing" ||
        !activeOwner ||
        integer(activeOwner, "active") !== 1 ||
        job.cancelRequested
      ) {
        return false;
      }
      install();
      this.db
        .prepare(
          `INSERT INTO receipts (job_id, owner_user_id, output_path, sha256, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET
             output_path = excluded.output_path,
             sha256 = excluded.sha256,
             created_at = excluded.created_at`,
        )
        .run(jobId, ownerUserId, outputPath, sha256, now);
      this.db
        .prepare(
          `UPDATE jobs
           SET output_path = ?, receipt_hash = ?, updated_at = ?
           WHERE id = ? AND owner_user_id = ? AND lease_token = ?`,
        )
        .run(outputPath, sha256, now, jobId, ownerUserId, leaseToken);
      return true;
    });
  }

  getReceipt(jobId: string, ownerUserId: string): JobReceipt | null {
    const row = this.db
      .prepare(
        "SELECT * FROM receipts WHERE job_id = ? AND owner_user_id = ?",
      )
      .get(jobId, ownerUserId);
    if (!row) return null;
    return {
      jobId: text(row as Row, "job_id"),
      ownerUserId: text(row as Row, "owner_user_id"),
      outputPath: text(row as Row, "output_path"),
      sha256: text(row as Row, "sha256"),
      createdAt: integer(row as Row, "created_at"),
    };
  }

  claimNext(workerId: string, now: number, leaseMs: number): Lease | null {
    return transaction(this.db, () => {
      const row = this.db
        .prepare(
          `SELECT jobs.* FROM jobs
           JOIN users ON users.id = jobs.owner_user_id
           WHERE users.active = 1
             AND jobs.state IN ('queued','running')
             AND (
               (jobs.state = 'queued' AND jobs.next_attempt_at <= ?)
               OR (jobs.state = 'running' AND jobs.lease_expires_at <= ?)
             )
             AND jobs.cancel_requested = 0
           ORDER BY jobs.next_attempt_at, jobs.created_at
           LIMIT 1`,
        )
        .get(now, now);
      if (!row) return null;
      const jobId = text(row as Row, "id");
      const ownerUserId = text(row as Row, "owner_user_id");
      const attempt = integer(row as Row, "attempt") + 1;
      const token = randomUUID();
      const result = this.db
        .prepare(
          `UPDATE jobs
           SET state = 'running', attempt = ?, worker_id = ?, lease_token = ?,
               lease_expires_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(attempt, workerId, token, now + leaseMs, now, jobId);
      if (Number(result.changes) !== 1) return null;
      this.db
        .prepare(
          `INSERT INTO job_attempts
           (id, job_id, owner_user_id, attempt, started_at, state)
           VALUES (?, ?, ?, ?, ?, 'running')`,
        )
        .run(randomUUID(), jobId, ownerUserId, attempt, now);
      this.db
        .prepare(
          `UPDATE documents SET state = 'pending', error = NULL
           WHERE job_id = ? AND state = 'processing'`,
        )
        .run(jobId);
      this.appendEvent(jobId, ownerUserId, "job.claimed", {
        workerId,
        leaseToken: token,
        attempt,
      });
      return {
        job: this.requireJob(jobId),
        workerId,
        token,
      };
    });
  }

  heartbeat(jobId: string, token: string, now: number, leaseMs: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE jobs
         SET lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND lease_token = ? AND state = 'running'`,
      )
      .run(now + leaseMs, now, jobId, token);
    return Number(result.changes) === 1;
  }

  beginPublication(jobId: string, token: string): boolean {
    const now = Date.now();
    return transaction(this.db, () => {
      const result = this.db
        .prepare(
          `UPDATE jobs
           SET state = 'publishing', updated_at = ?
           WHERE id = ? AND lease_token = ? AND state = 'running'
             AND cancel_requested = 0
             AND EXISTS (
               SELECT 1 FROM users
               WHERE users.id = jobs.owner_user_id AND users.active = 1
             )`,
        )
        .run(now, jobId, token);
      if (Number(result.changes) !== 1) return false;
      const job = this.requireJob(jobId);
      this.appendEvent(jobId, job.ownerUserId, "job.publishing", {});
      return true;
    });
  }

  complete(jobId: string, token: string): boolean {
    return transaction(this.db, () => {
      const job = this.getJob(jobId);
      if (!job || job.leaseToken !== token || job.state !== "publishing") {
        return false;
      }
      const now = Date.now();
      this.db
        .prepare(
          `UPDATE jobs
           SET state = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
               worker_id = NULL, updated_at = ?
           WHERE id = ? AND lease_token = ?`,
        )
        .run(now, jobId, token);
      this.db
        .prepare(
          `UPDATE job_attempts SET finished_at = ?, state = 'succeeded'
           WHERE job_id = ? AND attempt = ? AND finished_at IS NULL`,
        )
        .run(now, jobId, job.attempt);
      this.appendEvent(jobId, job.ownerUserId, "job.succeeded", {});
      return true;
    });
  }

  fail(jobId: string, token: string, error: string, retryAt: number | null): JobState {
    return transaction(this.db, () => {
      const job = this.getJob(jobId);
      if (!job || job.leaseToken !== token) return job?.state ?? "failed";
      const now = Date.now();
      const retry = retryAt !== null && job.attempt < job.maxAttempts;
      const state: JobState = retry
        ? "queued"
        : job.attempt >= job.maxAttempts
          ? "dead_letter"
          : "failed";
      this.db
        .prepare(
          `UPDATE jobs
           SET state = ?, error = ?, next_attempt_at = ?,
               lease_token = NULL, lease_expires_at = NULL, worker_id = NULL,
               updated_at = ?
           WHERE id = ? AND lease_token = ?`,
        )
        .run(state, error, retry ? retryAt : now, now, jobId, token);
      this.db
        .prepare(
          `UPDATE job_attempts SET finished_at = ?, state = ?, error = ?
           WHERE job_id = ? AND attempt = ? AND finished_at IS NULL`,
        )
        .run(now, state, error, jobId, job.attempt);
      if (retry) {
        this.db
          .prepare(
            `UPDATE documents SET state = 'pending'
             WHERE job_id = ? AND state = 'failed'`,
          )
          .run(jobId);
      }
      this.appendEvent(jobId, job.ownerUserId, "job.failed", {
        state,
        error,
        retryAt,
      });
      return state;
    });
  }

  release(jobId: string, token: string): boolean {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE jobs
         SET state = 'queued', lease_token = NULL, lease_expires_at = NULL,
             worker_id = NULL, next_attempt_at = ?, updated_at = ?
         WHERE id = ? AND lease_token = ? AND state = 'running'`,
      )
      .run(now, now, jobId, token);
    return Number(result.changes) === 1;
  }

  recoverExpired(now: number): number {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE state IN ('running','publishing') AND lease_expires_at <= ?`,
      )
      .all(now) as Row[];
    for (const row of rows) {
      const job = mapJob(row);
      const receipt = this.db
        .prepare("SELECT * FROM receipts WHERE job_id = ?")
        .get(job.id);
      if (job.state === "publishing" && receipt) {
        this.db
          .prepare(
            `UPDATE jobs
             SET state = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
                 worker_id = NULL, updated_at = ?
             WHERE id = ? AND state = 'publishing'`,
          )
          .run(now, job.id);
        this.db
          .prepare(
            `UPDATE job_attempts SET finished_at = ?, state = 'succeeded'
             WHERE job_id = ? AND attempt = ? AND finished_at IS NULL`,
          )
          .run(now, job.id, job.attempt);
        this.appendEvent(job.id, job.ownerUserId, "job.recovered_success", {});
        continue;
      }
      this.db
        .prepare(
          `UPDATE jobs
           SET state = 'queued', lease_token = NULL, lease_expires_at = NULL,
               worker_id = NULL, next_attempt_at = ?, updated_at = ?
           WHERE id = ? AND state IN ('running','publishing')`,
        )
        .run(now, now, job.id);
      this.appendEvent(job.id, job.ownerUserId, "job.lease_expired", {});
    }
    return rows.length;
  }

  private requireJob(id: string): Job {
    const job = this.getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    return job;
  }

  private leaseIsCurrent(
    jobId: string,
    ownerUserId: string,
    token: string,
  ): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM jobs
         JOIN users ON users.id = jobs.owner_user_id
         WHERE jobs.id = ? AND jobs.owner_user_id = ?
           AND jobs.lease_token = ? AND jobs.lease_expires_at > ?
           AND jobs.state IN ('running','publishing')
           AND jobs.cancel_requested = 0 AND users.active = 1`,
      )
      .get(jobId, ownerUserId, token, Date.now());
    return Boolean(row);
  }

  private appendSystemEvent(
    ownerUserId: string,
    type: string,
    payload: unknown,
    now: number,
  ): void {
    const ids = this.db
      .prepare("SELECT id FROM jobs WHERE owner_user_id = ?")
      .all(ownerUserId) as Row[];
    const insert = this.db.prepare(
      `INSERT INTO job_events
       (job_id, owner_user_id, type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const row of ids) {
      insert.run(text(row, "id"), ownerUserId, type, JSON.stringify(payload), now);
    }
  }
}
