import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import type { TextExtractorPort } from "../ports/text-extractor.port.js";

export class PdfTextExtractor implements TextExtractorPort {
  async extractText(filePath: string): Promise<string> {
    const absolute = path.resolve(filePath);
    const buffer = await fs.readFile(absolute);
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      const text = result.text?.trim() ?? "";

      if (!text) {
        throw new Error(
          `No extractable text in PDF: ${path.basename(filePath)}`,
        );
      }

      return text;
    } finally {
      await parser.destroy();
    }
  }
}

export function createPdfTextExtractor(): TextExtractorPort {
  return new PdfTextExtractor();
}
