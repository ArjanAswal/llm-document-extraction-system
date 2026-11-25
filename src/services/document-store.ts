import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import type {
  DocumentStorePort,
  StagedUpload,
  UploadedDocument,
} from "../ports/document-store.port.js";

export class FileDocumentStore implements DocumentStorePort {
  constructor(
    private readonly dataDir: string,
    private readonly maxUploadBytes: number,
  ) {}

  async stage(documents: UploadedDocument[]): Promise<StagedUpload> {
    if (documents.length === 0) throw new Error("At least one PDF is required");
    const names = new Set<string>();
    const jobId = randomUUID();
    const stagingDirectory = path.join(this.dataDir, ".staging", jobId);
    await fs.mkdir(stagingDirectory, { recursive: true });
    const staged = [];
    try {
      for (const document of documents) {
        const sourceFile = path.basename(document.originalName);
        if (sourceFile !== document.originalName || !sourceFile.toLowerCase().endsWith(".pdf")) {
          throw new Error(`Invalid upload filename: ${document.originalName}`);
        }
        if (names.has(sourceFile)) {
          throw new Error(`Duplicate filename in upload: ${sourceFile}`);
        }
        names.add(sourceFile);
        if (document.bytes.byteLength > this.maxUploadBytes) {
          throw new Error(`PDF exceeds ${this.maxUploadBytes} bytes: ${sourceFile}`);
        }
        const signature = Buffer.from(document.bytes.subarray(0, 5)).toString("ascii");
        if (signature !== "%PDF-") {
          throw new Error(`Not a PDF file: ${sourceFile}`);
        }
        const id = randomUUID();
        const storageName = `${id}-${sourceFile}`;
        const storagePath = path.join(stagingDirectory, storageName);
        await fs.writeFile(storagePath, document.bytes, { flag: "wx" });
        const sha256 = createHash("sha256").update(document.bytes).digest("hex");
        staged.push({ id, sourceFile, storagePath, sha256 });
      }
      return { jobId, directory: stagingDirectory, documents: staged };
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async commit(upload: StagedUpload): Promise<void> {
    const targetDirectory = path.join(this.dataDir, "jobs", upload.jobId);
    await fs.mkdir(path.dirname(targetDirectory), { recursive: true });
    await fs.rename(upload.directory, targetDirectory);
    for (const document of upload.documents) {
      document.storagePath = path.join(targetDirectory, path.basename(document.storagePath));
    }
  }

  async discard(upload: StagedUpload): Promise<void> {
    await fs.rm(upload.directory, { recursive: true, force: true });
    await fs.rm(path.join(this.dataDir, "jobs", upload.jobId), {
      recursive: true,
      force: true,
    });
  }

  async readPath(filePath: string): Promise<Uint8Array> {
    const resolved = path.resolve(filePath);
    const root = path.resolve(this.dataDir, "jobs");
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("Document path is outside the data directory");
    }
    return fs.readFile(resolved);
  }

  async deleteJobArtifacts(jobId: string): Promise<void> {
    const directory = path.join(this.dataDir, "jobs", jobId);
    await fs.rm(directory, { recursive: true, force: true });
  }
}
