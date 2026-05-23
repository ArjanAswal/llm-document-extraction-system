import { describe, it, expect } from "vitest";
import path from "path";
import { createPdfTextExtractor } from "../../src/services/pdf-text-extractor.js";

describe("PdfTextExtractor", () => {
  const extractor = createPdfTextExtractor();
  const invoicePath = path.join(
    process.cwd(),
    "invoices/invoice_01_electricity_us_clean.pdf",
  );

  it("extracts non-empty text from a sample PDF", async () => {
    const text = await extractor.extractText(invoicePath);
    expect(text.length).toBeGreaterThan(100);
    expect(text).toMatch(/PACIFIC GRID/i);
  });
});
