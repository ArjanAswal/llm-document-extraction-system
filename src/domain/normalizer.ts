import type { LlmExtraction, NormalizedExtraction, UtilityType } from "./invoice.types.js";

const CUBIC_M = "m\u00B3";

const UTILITY_SYNONYMS: Record<string, UtilityType> = {
  electricity: "electricity",
  electric: "electricity",
  electricite: "electricity",
  electricidad: "electricity",
  power: "electricity",
  gas: "gas",
  gaz: "gas",
  water: "water",
  agua: "water",
  eau: "water",
};

const UNIT_ALIASES: Record<string, string> = {
  kwh: "kWh",
  "kw/h": "kWh",
  kw: "kWh",
  therms: "therms",
  therm: "therms",
  thm: "therms",
  gallons: "gallons",
  gallon: "gallons",
  gal: "gallons",
  gals: "gallons",
  m3: CUBIC_M,
  [CUBIC_M]: CUBIC_M,
  "cubic meters": CUBIC_M,
  "cubic metres": CUBIC_M,
};

export interface NormalizeOptions {
  /** ISO 639-1 hint from franc (e.g. en, es, fr) for date parsing */
  localeHint?: string | null;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse date strings to ISO 8601. Uses locale hint for ambiguous DD/MM vs MM/DD. */
export function normalizeDate(
  value: string | null | undefined,
  localeHint?: string | null,
): string | null {
  if (!value?.trim()) return null;

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]!, 10);
    const b = parseInt(slashMatch[2]!, 10);
    const y = parseInt(slashMatch[3]!, 10);

    if (localeHint === "en" && a <= 12) {
      return toIso(y, a, b);
    }
    if (localeHint === "fr" || localeHint === "es" || localeHint === "en-GB") {
      return toIso(y, b, a);
    }
    if (a > 12) return toIso(y, b, a);
    if (b > 12) return toIso(y, a, b);
    return toIso(y, a, b);
  }

  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const d = parseInt(dotMatch[1]!, 10);
    const m = parseInt(dotMatch[2]!, 10);
    const y = parseInt(dotMatch[3]!, 10);
    return toIso(y, m, d);
  }

  return null;
}

export function normalizeUtilityType(
  value: string | null | undefined,
): UtilityType | null {
  if (!value?.trim()) return null;
  const ascii = value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return UTILITY_SYNONYMS[ascii] ?? null;
}

export function normalizeUnit(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const key = value.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? value.trim();
}

export function normalizeUsageAmount(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalize LLM extraction output to validated core fields.
 * Vendor name and service address are passed through unchanged.
 */
export function normalizeExtraction(
  raw: LlmExtraction,
  options: NormalizeOptions = {},
): NormalizedExtraction | null {
  const localeHint = options.localeHint ?? null;

  const utilityType = normalizeUtilityType(raw.utility_type);
  const invoiceDate = normalizeDate(raw.invoice_date, localeHint);
  const vendorName = raw.vendor_name?.trim();

  if (!vendorName || !utilityType || !invoiceDate) {
    return null;
  }

  return {
    vendor_name: vendorName,
    invoice_date: invoiceDate,
    service_address: raw.service_address?.trim() || null,
    utility_type: utilityType,
    usage_amount: normalizeUsageAmount(raw.usage_amount),
    usage_unit: normalizeUnit(raw.usage_unit),
    billing_period_start: normalizeDate(raw.billing_period_start, localeHint),
    billing_period_end: normalizeDate(raw.billing_period_end, localeHint),
    extraction_confidence: raw.extraction_confidence,
    field_confidence: raw.field_confidence,
  };
}

export { CUBIC_M };
