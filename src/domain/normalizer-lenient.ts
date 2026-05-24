import type { LlmExtraction, NormalizedExtraction } from "./invoice.types.js";
import {
  normalizeDate,
  normalizeUnit,
  normalizeUsageAmount,
  normalizeUtilityType,
  type NormalizeOptions,
} from "./normalizer.js";

/**
 * Best-effort normalization when strict normalizeExtraction fails.
 * Uses fallbacks so pipeline can still emit a row (never drop).
 */
export function normalizeExtractionLenient(
  raw: LlmExtraction,
  options: NormalizeOptions = {},
): NormalizedExtraction {
  const localeHint = options.localeHint ?? null;

  return {
    vendor_name: raw.vendor_name?.trim() || "Unknown Vendor",
    invoice_date: normalizeDate(raw.invoice_date, localeHint),
    service_address: raw.service_address?.trim() || null,
    utility_type: normalizeUtilityType(raw.utility_type) ?? "electricity",
    usage_amount: normalizeUsageAmount(raw.usage_amount),
    usage_unit: normalizeUnit(raw.usage_unit),
    billing_period_start: normalizeDate(raw.billing_period_start, localeHint),
    billing_period_end: normalizeDate(raw.billing_period_end, localeHint),
    extraction_confidence: raw.extraction_confidence,
    field_confidence: raw.field_confidence,
  };
}
