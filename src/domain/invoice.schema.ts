import { z } from "zod";

export const UtilityType = z.enum(["electricity", "gas", "water"]);

export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const FieldConfidenceSchema = z.object({
  vendor_name: z.number().min(0).max(1),
  invoice_date: z.number().min(0).max(1),
  service_address: z.number().min(0).max(1),
  utility_type: z.number().min(0).max(1),
  usage_amount: z.number().min(0).max(1),
  usage_unit: z.number().min(0).max(1),
  billing_period_start: z.number().min(0).max(1),
  billing_period_end: z.number().min(0).max(1),
});

/** Schema for LLM structured output (pre-metadata merge) */
export const LlmExtractionSchema = z.object({
  vendor_name: z.string().nullable(),
  invoice_date: z.string().nullable(),
  service_address: z.string().nullable(),
  utility_type: UtilityType.nullable(),
  usage_amount: z.union([z.number(), z.string()]).nullable(),
  usage_unit: z.string().nullable(),
  billing_period_start: z.string().nullable(),
  billing_period_end: z.string().nullable(),
  extraction_confidence: z.number().min(0).max(1),
  field_confidence: FieldConfidenceSchema.optional(),
});

/** Normalized core fields before metadata merge */
export const NormalizedExtractionSchema = z.object({
  vendor_name: z.string().min(1),
  invoice_date: z.string().regex(isoDateRegex),
  service_address: z.string().nullable(),
  utility_type: UtilityType,
  usage_amount: z.number().nullable(),
  usage_unit: z.string().nullable(),
  billing_period_start: z.string().regex(isoDateRegex).nullable(),
  billing_period_end: z.string().regex(isoDateRegex).nullable(),
  extraction_confidence: z.number().min(0).max(1),
  field_confidence: FieldConfidenceSchema.optional(),
});

/** Full CSV row including metadata and validation */
export const InvoiceRecordSchema = z.object({
  vendor_name: z.string().min(1),
  invoice_date: z.string().regex(isoDateRegex),
  service_address: z.string().nullable(),
  utility_type: UtilityType,
  usage_amount: z.number().nullable(),
  usage_unit: z.string().nullable(),
  billing_period_start: z.string().regex(isoDateRegex).nullable(),
  billing_period_end: z.string().regex(isoDateRegex).nullable(),
  source_file: z.string(),
  detected_language: z.string().nullable(),
  language_confidence: z.number().min(0).max(1).nullable(),
  extraction_confidence: z.number().min(0).max(1).nullable(),
  field_confidence: z.string().nullable(),
  validation_warnings: z.string().nullable(),
});

export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;
export type LlmExtractionRaw = z.infer<typeof LlmExtractionSchema>;
export type NormalizedExtraction = z.infer<typeof NormalizedExtractionSchema>;
export type InvoiceRecordRaw = z.infer<typeof InvoiceRecordSchema>;
