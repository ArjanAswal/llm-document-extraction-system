import type {
  ExtractionMeta,
  InvoiceExtractorPort,
} from "../ports/invoice-extractor.port.js";
import type { LlmExtraction } from "../domain/invoice.types.js";

export class FixtureInvoiceExtractor implements InvoiceExtractorPort {
  async extractInvoice(
    _text: string,
    meta: ExtractionMeta,
  ): Promise<LlmExtraction> {
    const gas = /gas/i.test(meta.sourceFile);
    const water = /water|agua/i.test(meta.sourceFile);
    return {
      vendor_name: `Fixture ${gas ? "Gas" : water ? "Water" : "Electric"} Utility`,
      invoice_date: "2024-01-15",
      service_address: "1 Fixture Avenue",
      utility_type: gas ? "gas" : water ? "water" : "electricity",
      usage_amount: 100,
      usage_unit: gas ? "therms" : water ? "CCF" : "kWh",
      billing_period_start: "2023-12-15",
      billing_period_end: "2024-01-14",
      extraction_confidence: 0.99,
      field_confidence: {
        vendor_name: 1,
        invoice_date: 1,
        service_address: 1,
        utility_type: 1,
        usage_amount: 1,
        usage_unit: 1,
        billing_period_start: 1,
        billing_period_end: 1,
      },
    };
  }
}
