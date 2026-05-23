import { describe, it, expect } from "vitest";
import path from "path";
import { createLanguageDetector } from "../../src/services/language-detector.js";
import { createPdfTextExtractor } from "../../src/services/pdf-text-extractor.js";

describe("FrancLanguageDetector", () => {
  const detector = createLanguageDetector();
  const pdfExtractor = createPdfTextExtractor();

  it("detects English from full invoice PDF text", async () => {
    const text = await pdfExtractor.extractText(
      path.join(process.cwd(), "invoices/invoice_01_electricity_us_clean.pdf"),
    );
    const result = detector.detectLanguage(text);
    expect(result.code).toBe("en");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("detects Spanish from full invoice PDF text", async () => {
    const text = await pdfExtractor.extractText(
      path.join(process.cwd(), "invoices/invoice_03_agua_espanol_ambiguous.pdf"),
    );
    const result = detector.detectLanguage(text);
    expect(result.code).toBe("es");
  });

  it("detects French from full invoice PDF text", async () => {
    const text = await pdfExtractor.extractText(
      path.join(process.cwd(), "invoices/invoice_04_electricite_francais_missing.pdf"),
    );
    const result = detector.detectLanguage(text);
    expect(result.code).toBe("fr");
  });

  it("returns null for empty text", () => {
    expect(detector.detectLanguage("")).toEqual({
      code: null,
      confidence: null,
    });
  });
});
