import { describe, it, expect } from "vitest";
import path from "path";
import { createPdfTextExtractor } from "../../src/services/pdf-text-extractor.js";
import { createInvoiceExtractor } from "../../src/services/invoice-extractor.js";
import { processInvoiceFile, createDefaultDeps } from "../../src/services/pipeline.js";

const hasApiKey = Boolean(process.env.GOOGLE_API_KEY);

describe.skipIf(!hasApiKey)("pipeline live", () => {
  it("extracts one invoice via real Gemini API", async () => {
    const deps = createDefaultDeps();
    const invoicePath = path.join(
      process.cwd(),
      "invoices/invoice_01_electricity_us_clean.pdf",
    );

    const record = await processInvoiceFile(invoicePath, deps);

    expect(record.vendor_name).toBeTruthy();
    expect(record.utility_type).toBe("electricity");
    expect(record.extraction_confidence).toBeGreaterThan(0);
  }, 60_000);
});

describe("live config", () => {
  it("skips when GOOGLE_API_KEY unset", () => {
    expect(typeof createInvoiceExtractor).toBe("function");
    expect(typeof createPdfTextExtractor).toBe("function");
  });
});
