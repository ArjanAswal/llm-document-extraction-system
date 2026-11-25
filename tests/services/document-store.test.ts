import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileDocumentStore } from "../../src/services/document-store.js";

const PDF_BYTES = Buffer.from("%PDF-1.7\nfixture\n%%EOF");

describe("FileDocumentStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-documents-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stages and atomically commits immutable snapshots", async () => {
    const store = new FileDocumentStore(tempDir, 1024);
    const upload = await store.stage([
      { originalName: "invoice.pdf", bytes: PDF_BYTES },
    ]);
    await store.commit(upload);

    const bytes = await store.readPath(upload.documents[0]!.storagePath);
    expect(Buffer.from(bytes).toString("utf8")).toContain("%PDF-1.7");
    expect(upload.documents[0]!.sha256).toHaveLength(64);
  });

  it("rejects duplicate names and oversized or non-PDF files", async () => {
    const store = new FileDocumentStore(tempDir, 1024);
    await expect(
      store.stage([
        { originalName: "invoice.pdf", bytes: PDF_BYTES },
        { originalName: "invoice.pdf", bytes: PDF_BYTES },
      ]),
    ).rejects.toThrow(/duplicate/i);
    await expect(
      store.stage([{ originalName: "text.txt", bytes: Buffer.from("no") }]),
    ).rejects.toThrow(/invalid upload filename/i);
    await expect(
      new FileDocumentStore(tempDir, 16).stage([
        { originalName: "large.pdf", bytes: Buffer.alloc(17, 1) },
      ]),
    ).rejects.toThrow(/exceeds/i);
  });
});
