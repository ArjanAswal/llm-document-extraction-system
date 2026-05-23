import type { NormalizedExtraction } from "./invoice.types.js";

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

const UNIT_TYPE_MAP: Record<string, string[]> = {
  electricity: ["kwh"],
  gas: ["therms", "therm"],
  water: ["gallons", "gal", "m³", "m3"],
};

function normalizeUnitKey(unit: string): string {
  return unit.toLowerCase().replace("³", "3");
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function validateInvoice(record: NormalizedExtraction): ValidationResult {
  const warnings: string[] = [];

  if (record.billing_period_start && record.billing_period_end) {
    if (record.billing_period_start > record.billing_period_end) {
      warnings.push("invalid_billing_period");
    }
  }

  if (record.usage_amount !== null && record.usage_amount < 0) {
    warnings.push("negative_usage");
  }

  const tomorrow = addDays(new Date(), 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  if (record.invoice_date > tomorrowIso) {
    warnings.push("future_invoice_date");
  }

  if (!record.service_address) {
    warnings.push("missing_required_field");
  }
  if (record.usage_amount === null) {
    warnings.push("missing_required_field");
  }
  if (!record.usage_unit) {
    warnings.push("missing_required_field");
  }

  if (record.usage_unit) {
    const unitKey = normalizeUnitKey(record.usage_unit);
    const expectedUnits = UNIT_TYPE_MAP[record.utility_type] ?? [];
    const matches = expectedUnits.some(
      (u) => unitKey.includes(u) || u.includes(unitKey),
    );
    if (!matches && expectedUnits.length > 0) {
      warnings.push("unit_type_mismatch");
    }
  }

  const uniqueWarnings = [...new Set(warnings)];
  return {
    valid: !uniqueWarnings.includes("invalid_billing_period") &&
      !uniqueWarnings.includes("negative_usage"),
    warnings: uniqueWarnings,
  };
}

export function appendPipelineWarnings(
  existing: string[],
  extractionConfidence: number | null,
  languageUndetected: boolean,
): string[] {
  const warnings = [...existing];
  if (extractionConfidence !== null && extractionConfidence < 0.5) {
    warnings.push("low_extraction_confidence");
  }
  if (languageUndetected) {
    warnings.push("language_undetected");
  }
  return [...new Set(warnings)];
}

export function formatWarnings(warnings: string[]): string | null {
  if (warnings.length === 0) return null;
  return warnings.join(";");
}
