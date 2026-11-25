import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export const MIGRATIONS = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('queued','running','publishing','succeeded','failed','dead_letter','cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  lease_token TEXT,
  lease_expires_at INTEGER,
  error TEXT,
  output_path TEXT,
  receipt_hash TEXT
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(state, next_attempt_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS jobs_owner_idx ON jobs(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  extractor TEXT NOT NULL,
  heartbeat_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  source_file TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','processing','succeeded','failed')),
  position INTEGER NOT NULL,
  record_json TEXT,
  error TEXT,
  UNIQUE(job_id, source_file)
);
CREATE INDEX IF NOT EXISTS documents_job_idx ON documents(job_id, position);

CREATE TABLE IF NOT EXISTS job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  attempt INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  state TEXT,
  error TEXT,
  UNIQUE(job_id, attempt)
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_stream_idx ON job_events(job_id, id);

CREATE TABLE IF NOT EXISTS receipts (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  output_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function ownerTrigger(table: string): string {
  return `
CREATE TRIGGER IF NOT EXISTS ${table}_owner_insert
BEFORE INSERT ON ${table}
WHEN NOT EXISTS (
  SELECT 1 FROM jobs
  WHERE jobs.id = NEW.job_id AND jobs.owner_user_id = NEW.owner_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS ${table}_owner_update
BEFORE UPDATE OF job_id, owner_user_id ON ${table}
WHEN NOT EXISTS (
  SELECT 1 FROM jobs
  WHERE jobs.id = NEW.job_id AND jobs.owner_user_id = NEW.owner_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'owner mismatch');
END;
`;
}

export function createDatabase(dataDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(MIGRATIONS);
  for (const table of ["documents", "job_attempts", "job_events", "receipts"]) {
    db.exec(ownerTrigger(table));
  }
  return db;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
