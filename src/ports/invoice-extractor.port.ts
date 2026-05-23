import type { LlmExtraction } from "../domain/invoice.types.js";

export interface ExtractionMeta {
  sourceFile: string;
  detectedLanguage: string | null;
}

export interface InvoiceExtractorPort {
  extractInvoice(text: string, meta: ExtractionMeta): Promise<LlmExtraction>;
}
