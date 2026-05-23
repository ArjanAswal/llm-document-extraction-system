import { describe, it, expect } from "vitest";
import {
  normalizeDate,
  normalizeExtraction,
  normalizeUnit,
  normalizeUsageAmount,
  normalizeUtilityType,
} from "../../src/domain/normalizer.js";

describe("normalizeDate", () => {
  it("passes through ISO dates", () => {
    expect(normalizeDate("2026-03-15")).toBe("2026-03-15");
  });

  it("parses US format with en hint", () => {
    expect(normalizeDate("03/15/2026", "en")).toBe("2026-03-15");
  });

  it("parses EU format with fr hint", () => {
    expect(normalizeDate("15/03/2026", "fr")).toBe("2026-03-15");
  });

  it("parses EU format with es hint", () => {
    expect(normalizeDate("15/03/2026", "es")).toBe("2026-03-15");
  });

  it("uses DD/MM heuristic when first part > 12", () => {
    expect(normalizeDate("15/03/2026")).toBe("2026-03-15");
  });

  it("returns null for invalid dates", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
  });
});

describe("normalizeUtilityType", () => {
  it("maps multilingual synonyms", () => {
    expect(normalizeUtilityType("\u00e9lectricit\u00e9")).toBe("electricity");
    expect(normalizeUtilityType("agua")).toBe("water");
    expect(normalizeUtilityType("gaz")).toBe("gas");
  });
});

describe("normalizeUnit", () => {
  it("maps unit aliases", () => {
    expect(normalizeUnit("kwh")).toBe("kWh");
    expect(normalizeUnit("gal")).toBe("gallons");
    expect(normalizeUnit("m3")).toBe("m\u00B3");
  });
});

describe("normalizeUsageAmount", () => {
  it("parses numeric strings with separators", () => {
    expect(normalizeUsageAmount("1,234.56")).toBe(1234.56);
  });

  it("returns null for unparseable values", () => {
    expect(normalizeUsageAmount("unknown")).toBeNull();
  });
});

describe("normalizeExtraction", () => {
  it("normalizes a complete LLM extraction", () => {
    const result = normalizeExtraction(
      {
        vendor_name: "  Acme Power  ",
        invoice_date: "03/15/2026",
        service_address: "123 Main",
        utility_type: "electricity",
        usage_amount: "450",
        usage_unit: "kwh",
        billing_period_start: "02/01/2026",
        billing_period_end: "03/01/2026",
        extraction_confidence: 0.9,
      },
      { localeHint: "en" },
    );
    expect(result).toMatchObject({
      vendor_name: "Acme Power",
      invoice_date: "2026-03-15",
      utility_type: "electricity",
      usage_amount: 450,
      usage_unit: "kWh",
    });
  });

  it("returns null when required fields missing", () => {
    expect(
      normalizeExtraction({
        vendor_name: null,
        invoice_date: "2026-01-01",
        service_address: null,
        utility_type: "gas",
        usage_amount: null,
        usage_unit: null,
        billing_period_start: null,
        billing_period_end: null,
        extraction_confidence: 0.5,
      }),
    ).toBeNull();
  });
});
