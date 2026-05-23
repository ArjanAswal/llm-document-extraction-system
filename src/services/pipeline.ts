import path from "path";
import { normalizeExtraction } from "../domain/normalizer.js";
import { normalizeExtractionLenient } from "../domain/normalizer-lenient.js";
import {
  appendPipelineWarnings,
  formatWarnings,
  validateInvoice,
} from "../domain/invoice.validator.js";
import { serializeFieldConfidence, type InvoiceRecord } from "../domain/invoice.types.js";
import type { TextExtractorPort } from "../ports/text-extractor.port.js";
import type { LanguageDetectorPort } from "../ports/language-detector.port.js";
import type { InvoiceExtractorPort } from "../ports/invoice-extractor.port.js";
import type { OutputWriterPort } from "../ports/output-writer.port.js";
import { createCsvWriter } from "./csv-writer.js";
import { createInvoiceExtractor } from "./invoice-extractor.js";
import { createLanguageDetector } from "./language-detector.js";
import { createPdfTextExtractor } from "./pdf-text-extractor.js";

export interface PipelineDeps {
  textExtractor: TextExtractorPort;
  languageDetector: LanguageDetectorPort;
  invoiceExtractor: InvoiceExtractorPort;
  outputWriter: OutputWriterPort;
}

export interface PipelineOptions {
  inputDir: string;
  outputPath: string;
  deps?: Partial<PipelineDeps>;
}

export function createDefaultDeps(): PipelineDeps {
  return {
    textExtractor: createPdfTextExtractor(),
    languageDetector: createLanguageDetector(),
    invoiceExtractor: createInvoiceExtractor(),
    outputWriter: createCsvWriter(),
  };
}

export async function processInvoiceFile(
  filePath: string,
  deps: PipelineDeps,
): Promise<InvoiceRecord> {
  const sourceFile = path.basename(filePath);
  const text = await deps.textExtractor.extractText(filePath);
  const language = deps.languageDetector.detectLanguage(text);
  const languageUndetected = language.code === null;

  const raw = await deps.invoiceExtractor.extractInvoice(text, {
    sourceFile,
    detectedLanguage: language.code,
  });

  const strictNormalized = normalizeExtraction(raw, { localeHint: language.code });
  const normalized =
    strictNormalized ??
    normalizeExtractionLenient(raw, { localeHint: language.code });

  const validation = validateInvoice(normalized);
  const baseWarnings = strictNormalized
    ? validation.warnings
    : [...validation.warnings, "normalization_lenient"];

  const warnings = appendPipelineWarnings(
    baseWarnings,
    normalized.extraction_confidence,
    languageUndetected,
  );

  return {
    vendor_name: normalized.vendor_name,
    invoice_date: normalized.invoice_date,
    service_address: normalized.service_address,
    utility_type: normalized.utility_type,
    usage_amount: normalized.usage_amount,
    usage_unit: normalized.usage_unit,
    billing_period_start: normalized.billing_period_start,
    billing_period_end: normalized.billing_period_end,
    source_file: sourceFile,
    detected_language: language.code,
    language_confidence: language.confidence,
    extraction_confidence: normalized.extraction_confidence,
    field_confidence: serializeFieldConfidence(normalized.field_confidence),
    validation_warnings: formatWarnings(warnings),
  };
}

export function resolvePipelineDeps(partial?: Partial<PipelineDeps>): PipelineDeps {
  if (
    partial?.textExtractor &&
    partial?.languageDetector &&
    partial?.invoiceExtractor &&
    partial?.outputWriter
  ) {
    return partial as PipelineDeps;
  }

  const defaults = createDefaultDeps();
  return {
    textExtractor: partial?.textExtractor ?? defaults.textExtractor,
    languageDetector: partial?.languageDetector ?? defaults.languageDetector,
    invoiceExtractor: partial?.invoiceExtractor ?? defaults.invoiceExtractor,
    outputWriter: partial?.outputWriter ?? defaults.outputWriter,
  };
}

export async function runPipeline(options: PipelineOptions): Promise<InvoiceRecord[]> {
  const deps = resolvePipelineDeps(options.deps);

  const fs = await import("fs/promises");
  const entries = await fs.readdir(options.inputDir);
  const pdfFiles = entries
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort()
    .map((f) => path.join(options.inputDir, f));

  const records: InvoiceRecord[] = [];

  for (const filePath of pdfFiles) {
    const record = await processInvoiceFile(filePath, deps);
    records.push(record);
  }

  await deps.outputWriter.writeRecords(options.outputPath, records);
  return records;
}
