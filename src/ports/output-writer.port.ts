import type { InvoiceRecord } from "../domain/invoice.types.js";

export interface OutputWriterPort {
  writeRecords(filePath: string, records: InvoiceRecord[]): Promise<void>;
}
