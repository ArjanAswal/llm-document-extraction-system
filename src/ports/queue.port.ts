import type { Job, JobState } from "../domain/job.schema.js";

export interface Lease {
  job: Job;
  workerId: string;
  token: string;
}

export interface QueuePort {
  claimNext(workerId: string, now: number, leaseMs: number): Lease | null;
  heartbeat(jobId: string, token: string, now: number, leaseMs: number): boolean;
  beginPublication(jobId: string, token: string): boolean;
  complete(jobId: string, token: string): boolean;
  fail(jobId: string, token: string, error: string, retryAt: number | null): JobState;
  release(jobId: string, token: string): boolean;
  recoverExpired(now: number): number;
}
