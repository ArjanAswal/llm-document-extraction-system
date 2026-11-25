export interface User {
  id: string;
  email: string;
}

export interface Session {
  user: User;
  csrfToken: string;
}

export interface Job {
  id: string;
  ownerUserId: string;
  state: string;
  attempt: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  cancelRequested: boolean;
  workerId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  error: string | null;
  outputPath: string | null;
  receiptHash: string | null;
}

export interface JobDocument {
  id: string;
  jobId: string;
  sourceFile: string;
  state: string;
  record: Record<string, unknown> | null;
  error: string | null;
}

export interface JobBundle {
  job: Job;
  documents: JobDocument[];
}

export interface JobResult {
  job: Job;
  records: Array<Record<string, unknown>>;
  errors: Array<{ source_file: string; error: string | null }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken = "";

async function request<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase()) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

export async function getSession(): Promise<Session | null> {
  try {
    const result = await request<Session>("/api/session");
    csrfToken = result.csrfToken;
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function register(email: string, password: string): Promise<Session> {
  await request<User>("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return login(email, password);
}

export async function login(email: string, password: string): Promise<Session> {
  const result = await request<{ user: User; csrfToken: string }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  csrfToken = result.csrfToken;
  return result;
}

export async function logout(): Promise<void> {
  await request<void>("/api/logout", { method: "POST" });
  csrfToken = "";
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request<void>("/api/password/change", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await request<void>("/api/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await request<void>("/api/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function deleteAccount(): Promise<void> {
  await request<void>("/api/account", { method: "DELETE" });
  csrfToken = "";
}

export async function listJobs(): Promise<JobBundle[]> {
  return request<JobBundle[]>("/api/jobs");
}

export async function uploadFiles(files: File[]): Promise<{ id: string }> {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  return request<{ id: string }>("/api/jobs", {
    method: "POST",
    body,
  });
}

export async function getJobResult(jobId: string): Promise<JobResult> {
  return request<JobResult>(`/api/jobs/${jobId}/result`);
}

export async function retryJob(jobId: string): Promise<Job> {
  return request<Job>(`/api/jobs/${jobId}/retry`, { method: "POST" });
}

export async function cancelJob(jobId: string): Promise<{ state: string }> {
  return request<{ state: string }>(`/api/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}

export function openJobEvents(jobId: string): EventSource {
  return new EventSource(`/api/jobs/${jobId}/events`);
}

export function csvUrl(jobId: string): string {
  return `/api/jobs/${jobId}/csv`;
}
