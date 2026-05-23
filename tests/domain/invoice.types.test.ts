import { CSV_COLUMNS } from "../../src/domain/invoice.types.js";
import { describe, it, expect } from "vitest";

describe("CSV_COLUMNS", () => {
  it("includes all required and bonus columns in order", () => {
    expect(CSV_COLUMNS).toEqual([
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
    ]);
  });
});
