import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { runPipeline, resolvePipelineDeps } from "../../src/services/pipeline.js";
import { CSV_COLUMNS } from "../../src/domain/invoice.types.js";
import type { TextExtractorPort } from "../../src/ports/text-extractor.port.js";
import type { LanguageDetectorPort } from "../../src/ports/language-detector.port.js";
import type { InvoiceExtractorPort } from "../../src/ports/invoice-extractor.port.js";
import {
  ENGLISH_ELECTRICITY_SNIPPET,
  MOCK_LLM_AMBIGUOUS,
  MOCK_LLM_EXTRACTION,
  MOCK_LLM_MISSING_FIELDS,
} from "../fixtures/sample-text.js";

describe("runPipeline", () => {
  let tmpDir: string;
  let outputPath: string;

  const mockTextExtractor: TextExtractorPort = {
    extractText: vi.fn().mockResolvedValue(ENGLISH_ELECTRICITY_SNIPPET),
  };

  const mockLanguageDetector: LanguageDetectorPort = {
    detectLanguage: vi.fn().mockReturnValue({ code: "en", confidence: 0.9 }),
  };

  const mockInvoiceExtractor: InvoiceExtractorPort = {
    extractInvoice: vi.fn(),
  };

  const mockOutputWriter = {
    writeRecords: vi.fn().mockResolvedValue(undefined),
  };

  function fullDeps() {
    return resolvePipelineDeps({
      textExtractor: mockTextExtractor,
      languageDetector: mockLanguageDetector,
      invoiceExtractor: mockInvoiceExtractor,
      outputWriter: mockOutputWriter,
    });
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-pipeline-"));
    outputPath = path.join(tmpDir, "out.csv");
    vi.mocked(mockInvoiceExtractor.extractInvoice).mockResolvedValue(
      MOCK_LLM_EXTRACTION,
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("writes CSV with all columns using injected deps", async () => {
    const records = await runPipeline({
      inputDir: path.join(process.cwd(), "invoices"),
      outputPath,
      deps: fullDeps(),
    });

    expect(records).toHaveLength(5);
    expect(records[0]!.utility_type).toBe("electricity");
    expect(records[0]!.detected_language).toBe("en");
    expect(records[0]!.field_confidence).toBeTruthy();

    expect(mockOutputWriter.writeRecords).toHaveBeenCalledWith(
      outputPath,
      expect.arrayContaining([
        expect.objectContaining({ source_file: expect.any(String) }),
      ]),
    );

    const writtenRecords = vi.mocked(mockOutputWriter.writeRecords).mock
      .calls[0]![1] as typeof records;
    for (const col of CSV_COLUMNS) {
      expect(writtenRecords[0]).toHaveProperty(col);
    }
  });

  it("adds validation warnings for missing-field extraction", async () => {
    vi.mocked(mockInvoiceExtractor.extractInvoice).mockResolvedValue(
      MOCK_LLM_MISSING_FIELDS,
    );

    const records = await runPipeline({
      inputDir: path.join(process.cwd(), "invoices"),
      outputPath,
      deps: fullDeps(),
    });

    expect(records[0]!.usage_amount).toBeNull();
    expect(records[0]!.validation_warnings).toContain("missing_required_field");
    expect(records[0]!.validation_warnings).toContain("low_extraction_confidence");
  });

  it("flags ambiguous usage with moderate confidence", async () => {
    vi.mocked(mockInvoiceExtractor.extractInvoice).mockResolvedValue(
      MOCK_LLM_AMBIGUOUS,
    );

    const records = await runPipeline({
      inputDir: path.join(process.cwd(), "invoices"),
      outputPath,
      deps: fullDeps(),
    });

    expect(records[0]!.usage_amount).toBeNull();
    expect(records[0]!.extraction_confidence).toBeLessThan(0.7);
  });
});
