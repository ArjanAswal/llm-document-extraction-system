import { describe, it, expect } from "vitest";
import {
  InvoiceRecordSchema,
  LlmExtractionSchema,
  UtilityType,
} from "../../src/domain/invoice.schema.js";

describe("InvoiceRecordSchema", () => {
  const validRecord = {
    vendor_name: "Acme Power",
    invoice_date: "2026-03-15",
    service_address: "123 Main St",
    utility_type: "electricity" as const,
    usage_amount: 450.5,
    usage_unit: "kWh",
    billing_period_start: "2026-02-01",
    billing_period_end: "2026-03-01",
    source_file: "invoice_01.pdf",
    detected_language: "en",
    language_confidence: 0.9,
    extraction_confidence: 0.95,
    field_confidence: '{"vendor_name":0.99}',
    validation_warnings: null,
  };

  it("accepts a valid full record", () => {
    expect(InvoiceRecordSchema.parse(validRecord)).toEqual(validRecord);
  });

  it("accepts null invoice_date when missing on source document", () => {
    const partial = {
      ...validRecord,
      invoice_date: null,
      validation_warnings: "missing_required_field",
    };
    expect(InvoiceRecordSchema.parse(partial)).toBeDefined();
  });

  it("accepts null optional fields", () => {
    const partial = {
      ...validRecord,
      service_address: null,
      usage_amount: null,
      usage_unit: null,
      billing_period_start: null,
      billing_period_end: null,
      validation_warnings: "missing_required_field",
    };
    expect(InvoiceRecordSchema.parse(partial)).toBeDefined();
  });

  it("rejects invalid utility_type", () => {
    expect(() =>
      InvoiceRecordSchema.parse({ ...validRecord, utility_type: "solar" }),
    ).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      InvoiceRecordSchema.parse({ ...validRecord, invoice_date: "03/15/2026" }),
    ).toThrow();
  });
});

describe("LlmExtractionSchema", () => {
  it("accepts ambiguous usage as null", () => {
    const result = LlmExtractionSchema.parse({
      vendor_name: "Vendor",
      invoice_date: "2026-01-01",
      service_address: null,
      utility_type: "water",
      usage_amount: null,
      usage_unit: null,
      billing_period_start: null,
      billing_period_end: null,
      extraction_confidence: 0.4,
    });
    expect(result.usage_amount).toBeNull();
  });

  it("requires extraction_confidence", () => {
    expect(() =>
      LlmExtractionSchema.parse({
        vendor_name: "V",
        extraction_confidence: 1.5,
      }),
    ).toThrow();
  });
});

describe("UtilityType", () => {
  it("only allows electricity, gas, water", () => {
    expect(UtilityType.options).toEqual(["electricity", "gas", "water"]);
  });
});
