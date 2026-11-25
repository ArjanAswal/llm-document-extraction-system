import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/services/sqlite-database.js";
import { SqliteStore } from "../../src/services/sqlite-store.js";

describe("SqliteStore", () => {
  let tempDir: string;
  let store: SqliteStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-store-"));
    store = new SqliteStore(createDatabase(tempDir), 5);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates owned jobs and claims them once", () => {
    const user = store.createUser("owner@example.test", "hash", "salt");
    const jobId = randomUUID();
    store.createJob(user.id, jobId, [
      {
        sourceFile: "one.pdf",
        storagePath: path.join(tempDir, "one.pdf"),
        sha256: "a".repeat(64),
      },
    ]);

    const now = Date.now();
    const lease = store.claimNext("worker-a", now, 5_000);
    expect(lease?.job.id).toBe(jobId);
    expect(lease?.token).toBeTruthy();
    expect(store.claimNext("worker-b", now, 5_000)).toBeNull();
  });

  it("fences stale leases and recovers expired ones", () => {
    const user = store.createUser("owner@example.test", "hash", "salt");
    const jobId = randomUUID();
    store.createJob(user.id, jobId, [
      {
        sourceFile: "one.pdf",
        storagePath: path.join(tempDir, "one.pdf"),
        sha256: "a".repeat(64),
      },
    ]);
    const now = Date.now();
    const first = store.claimNext("worker-a", now, 2_000)!;
    expect(store.recoverExpired(now + 2_001)).toBe(1);
    const second = store.claimNext("worker-b", now + 2_002, 5_000);
    expect(second?.job.id).toBe(jobId);
    expect(store.heartbeat(jobId, first.token, now + 2_002, 5_000)).toBe(false);
  });

  it("rejects child rows with an owner mismatch", () => {
    const user = store.createUser("owner@example.test", "hash", "salt");
    const other = store.createUser("other@example.test", "hash", "salt");
    const jobId = randomUUID();
    store.createJob(user.id, jobId, [
      {
        sourceFile: "one.pdf",
        storagePath: path.join(tempDir, "one.pdf"),
        sha256: "a".repeat(64),
      },
    ]);

    expect(() =>
      store.appendEvent(jobId, other.id, "forged.owner", {}),
    ).toThrow(/owner mismatch/i);
  });
});
