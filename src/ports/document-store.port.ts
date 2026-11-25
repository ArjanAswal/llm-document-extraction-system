export interface UploadedDocument {
  originalName: string;
  bytes: Uint8Array;
}

export interface StagedDocument {
  id: string;
  sourceFile: string;
  storagePath: string;
  sha256: string;
}

export interface StagedUpload {
  jobId: string;
  directory: string;
  documents: StagedDocument[];
}

export interface DocumentStorePort {
  stage(documents: UploadedDocument[]): Promise<StagedUpload>;
  discard(upload: StagedUpload): Promise<void>;
  commit(upload: StagedUpload): Promise<void>;
  readPath(path: string): Promise<Uint8Array>;
  deleteJobArtifacts(jobId: string): Promise<void>;
}
