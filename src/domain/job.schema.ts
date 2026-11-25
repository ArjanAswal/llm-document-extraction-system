import { z } from "zod";

export const JobStateSchema = z.enum([
  "queued",
  "running",
  "publishing",
  "succeeded",
  "failed",
  "dead_letter",
  "cancelled",
]);

export const DocumentStateSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
]);

export const JobDocumentSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  sourceFile: z.string().min(1),
  storagePath: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  state: DocumentStateSchema,
  record: z.unknown().nullable(),
  error: z.string().nullable(),
});

export const JobSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  state: JobStateSchema,
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  nextAttemptAt: z.number().int(),
  cancelRequested: z.boolean(),
  workerId: z.string().nullable(),
  leaseToken: z.string().nullable(),
  leaseExpiresAt: z.number().int().nullable(),
  error: z.string().nullable(),
  outputPath: z.string().nullable(),
  receiptHash: z.string().nullable(),
});

export type JobState = z.infer<typeof JobStateSchema>;
export type DocumentState = z.infer<typeof DocumentStateSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobDocument = z.infer<typeof JobDocumentSchema>;
