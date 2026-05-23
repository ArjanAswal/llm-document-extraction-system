import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { LlmExtractionSchema } from "../domain/invoice.schema.js";
import type { LlmExtraction } from "../domain/invoice.types.js";
import type {
  ExtractionMeta,
  InvoiceExtractorPort,
} from "../ports/invoice-extractor.port.js";

const SYSTEM_PROMPT = `You are an expert utility invoice parser. Extract structured data from electricity, gas, or water bills.

The invoice text may be in English, Spanish, French, or other languages. Do NOT translate the document ù extract structurally.

Rules:
- Map utility_type to exactly one of: electricity, gas, water
- Normalize dates to ISO 8601 (YYYY-MM-DD) when possible
- usage_amount must be numeric only (no units in the number)
- Preserve vendor_name and service_address as printed
- Use null for missing, ambiguous, or unreadable fields
- extraction_confidence: 0ù1 certainty for the whole record (use < 0.5 when fields are missing or ambiguous)
- field_confidence: optional per-field scores 0ù1 for each core field`;

function buildUserPrompt(text: string, meta: ExtractionMeta): string {
  return `Source file: ${meta.sourceFile}
Detected language hint: ${meta.detectedLanguage ?? "unknown"}

Invoice text:
---
${text}
---`;
}

export class GeminiInvoiceExtractor implements InvoiceExtractorPort {
  private readonly structuredModel;

  constructor(modelName?: string, apiKey?: string) {
    const model = new ChatGoogleGenerativeAI({
      model: modelName ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview",
      apiKey: apiKey ?? process.env.GOOGLE_API_KEY,
      temperature: 0,
    });
    this.structuredModel = model.withStructuredOutput(LlmExtractionSchema);
  }

  async extractInvoice(text: string, meta: ExtractionMeta): Promise<LlmExtraction> {
    const result = await this.structuredModel.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(buildUserPrompt(text, meta)),
    ]);
    return result as LlmExtraction;
  }
}

export function createInvoiceExtractor(
  modelName?: string,
  apiKey?: string,
): InvoiceExtractorPort {
  return new GeminiInvoiceExtractor(modelName, apiKey);
}
