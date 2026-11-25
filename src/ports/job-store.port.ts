import type { InvoiceRecord } from "../domain/invoice.types.js";
import type { Job, JobDocument, JobState } from "../domain/job.schema.js";

export interface NewJobDocument {
  sourceFile: string;
  storagePath: string;
  sha256: string;
}

export interface JobWithDocuments {
  job: Job;
  documents: JobDocument[];
}

export interface JobEvent {
  id: number;
  jobId: string;
  ownerUserId: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

export interface JobReceipt {
  jobId: string;
  ownerUserId: string;
  outputPath: string;
  sha256: string;
  createdAt: number;
}

export interface JobStorePort {
  createJob(ownerUserId: string, jobId: string, documents: NewJobDocument[]): Job;
  getJob(id: string): Job | null;
  getOwnedJob(id: string, ownerUserId: string): JobWithDocuments | null;
  listOwnedJobs(ownerUserId: string): JobWithDocuments[];
  getDocuments(jobId: string): JobDocument[];
  getPendingDocuments(jobId: string): JobDocument[];
  markDocumentProcessing(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
  ): boolean;
  saveDocumentResult(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
    record: InvoiceRecord,
  ): boolean;
  saveDocumentFailure(
    jobId: string,
    documentId: string,
    ownerUserId: string,
    leaseToken: string,
    message: string,
  ): boolean;
  appendEvent(jobId: string, ownerUserId: string, type: string, payload: unknown): JobEvent;
  listEvents(jobId: string, ownerUserId: string, afterId: number): JobEvent[];
  requestCancel(jobId: string, ownerUserId: string): JobState;
  requestRetry(jobId: string, ownerUserId: string): Job;
  markOwnedJobsCancelled(ownerUserId: string): number;
  saveReceipt(receipt: JobReceipt): boolean;
  commitPublication(
    jobId: string,
    ownerUserId: string,
    leaseToken: string,
    outputPath: string,
    sha256: string,
    install: () => void,
  ): boolean;
  getReceipt(jobId: string, ownerUserId: string): JobReceipt | null;
}
