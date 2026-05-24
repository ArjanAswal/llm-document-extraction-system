import { describe, it, expect } from "vitest";
import {
  validateInvoice,
  appendPipelineWarnings,
  formatWarnings,
} from "../../src/domain/invoice.validator.js";
import type { NormalizedExtraction } from "../../src/domain/invoice.types.js";

function baseRecord(
  overrides: Partial<NormalizedExtraction> = {},
): NormalizedExtraction {
  return {
    vendor_name: "Acme",
    invoice_date: "2026-03-01",
    service_address: "123 Main",
    utility_type: "electricity",
    usage_amount: 100,
    usage_unit: "kWh",
    billing_period_start: "2026-02-01",
    billing_period_end: "2026-03-01",
    extraction_confidence: 0.9,
    ...overrides,
  };
}

describe("validateInvoice", () => {
  it("passes a clean record with minimal warnings", () => {
    const result = validateInvoice(baseRecord());
    expect(result.valid).toBe(true);
    expect(result.warnings).not.toContain("invalid_billing_period");
  });

  it("emits invalid_billing_period when start > end", () => {
    const result = validateInvoice(
      baseRecord({
        billing_period_start: "2026-04-01",
        billing_period_end: "2026-03-01",
      }),
    );
    expect(result.warnings).toContain("invalid_billing_period");
    expect(result.valid).toBe(false);
  });

  it("emits negative_usage for negative amounts", () => {
    const result = validateInvoice(baseRecord({ usage_amount: -5 }));
    expect(result.warnings).toContain("negative_usage");
    expect(result.valid).toBe(false);
  });

  it("emits future_invoice_date for far-future dates", () => {
    const result = validateInvoice(
      baseRecord({ invoice_date: "2099-01-01" }),
    );
    expect(result.warnings).toContain("future_invoice_date");
  });

  it("emits missing_required_field for null usage", () => {
    const result = validateInvoice(
      baseRecord({ usage_amount: null, usage_unit: null, service_address: null }),
    );
    expect(result.warnings).toContain("missing_required_field");
  });

  it("emits unit_type_mismatch for gas + kWh", () => {
    const result = validateInvoice(
      baseRecord({
        utility_type: "gas",
        usage_unit: "kWh",
      }),
    );
    expect(result.warnings).toContain("unit_type_mismatch");
  });

  it("accepts m³ for water", () => {
    const result = validateInvoice(
      baseRecord({
        utility_type: "water",
        usage_unit: "m\u00B3",
        usage_amount: 23,
      }),
    );
    expect(result.warnings).not.toContain("unit_type_mismatch");
  });

  it("accepts CCF for water", () => {
    const result = validateInvoice(
      baseRecord({
        utility_type: "water",
        usage_unit: "CCF",
        usage_amount: 18,
      }),
    );
    expect(result.warnings).not.toContain("unit_type_mismatch");
  });

  it("warns when invoice_date is missing", () => {
    const result = validateInvoice(baseRecord({ invoice_date: null }));
    expect(result.warnings).toContain("missing_required_field");
  });
});

describe("appendPipelineWarnings", () => {
  it("adds low_extraction_confidence when score < 0.5", () => {
    const warnings = appendPipelineWarnings([], 0.3, false);
    expect(warnings).toContain("low_extraction_confidence");
  });

  it("adds language_undetected flag", () => {
    const warnings = appendPipelineWarnings([], null, true);
    expect(warnings).toContain("language_undetected");
  });
});

describe("formatWarnings", () => {
  it("joins warnings with semicolons", () => {
    expect(formatWarnings(["a", "b"])).toBe("a;b");
  });

  it("returns null for empty array", () => {
    expect(formatWarnings([])).toBeNull();
  });
});
