import { describe, it, expect } from "vitest";
import { LlmExtractionSchema } from "../../src/domain/invoice.schema.js";
import { MOCK_LLM_EXTRACTION, MOCK_LLM_AMBIGUOUS } from "../fixtures/sample-text.js";

describe("LlmExtractionSchema (extractor output shape)", () => {
  it("parses a complete extraction with confidence scores", () => {
    const result = LlmExtractionSchema.parse(MOCK_LLM_EXTRACTION);
    expect(result.extraction_confidence).toBe(0.92);
    expect(result.field_confidence?.usage_amount).toBe(0.88);
  });

  it("parses ambiguous extraction with low confidence", () => {
    const result = LlmExtractionSchema.parse(MOCK_LLM_AMBIGUOUS);
    expect(result.extraction_confidence).toBeLessThan(0.7);
    expect(result.usage_amount).toBeNull();
  });
});
