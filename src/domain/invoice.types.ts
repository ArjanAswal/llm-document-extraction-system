import type { FieldConfidence, LlmExtractionRaw, NormalizedExtraction } from "./invoice.schema.js";
import type { z } from "zod";
import { UtilityType as UtilityTypeSchema } from "./invoice.schema.js";

export type UtilityType = z.infer<typeof UtilityTypeSchema>;

/** LLM extraction with required confidence (after parse) */
export interface LlmExtraction {
  vendor_name: string | null;
  invoice_date: string | null;
  service_address: string | null;
  utility_type: UtilityType | null;
  usage_amount: number | string | null;
  usage_unit: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  extraction_confidence: number;
  field_confidence?: FieldConfidence;
}

export type InvoiceRecord = {
  vendor_name: string;
  invoice_date: string;
  service_address: string | null;
  utility_type: UtilityType;
  usage_amount: number | null;
  usage_unit: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  source_file: string;
  detected_language: string | null;
  language_confidence: number | null;
  extraction_confidence: number | null;
  field_confidence: string | null;
  validation_warnings: string | null;
};

/** Fixed CSV column order ù breaking changes require schema version bump */
export const CSV_COLUMNS = [
  "vendor_name",
  "invoice_date",
  "service_address",
  "utility_type",
  "usage_amount",
  "usage_unit",
  "billing_period_start",
  "billing_period_end",
  "source_file",
  "detected_language",
  "language_confidence",
  "extraction_confidence",
  "field_confidence",
  "validation_warnings",
] as const satisfies readonly (keyof InvoiceRecord)[];

export function toLlmExtraction(raw: LlmExtractionRaw): LlmExtraction {
  return raw as LlmExtraction;
}

export function serializeFieldConfidence(fc?: FieldConfidence): string | null {
  if (!fc) return null;
  return JSON.stringify(fc);
}

export type { NormalizedExtraction, FieldConfidence };
