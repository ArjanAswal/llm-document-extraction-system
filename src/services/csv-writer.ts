import { createObjectCsvWriter } from "csv-writer";
import { CSV_COLUMNS, type InvoiceRecord } from "../domain/invoice.types.js";
import type { OutputWriterPort } from "../ports/output-writer.port.js";

function toCsvValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return "";
  return value as string | number;
}

export class CsvOutputWriter implements OutputWriterPort {
  async writeRecords(filePath: string, records: InvoiceRecord[]): Promise<void> {
    const header = CSV_COLUMNS.map((id) => ({ id, title: id }));

    const writer = createObjectCsvWriter({
      path: filePath,
      header,
      alwaysQuote: false,
    });

    const rows = records.map((record) => {
      const row: Record<string, string | number> = {};
      for (const col of CSV_COLUMNS) {
        row[col] = toCsvValue(record[col]) as string | number;
      }
      return row;
    });

    await writer.writeRecords(rows);
  }
}

export function createCsvWriter(): OutputWriterPort {
  return new CsvOutputWriter();
}
