import http, { type IncomingMessage, type ServerResponse } from "http";
import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";
import {
  AccountInputSchema,
  ForgotPasswordSchema,
  LoginInputSchema,
  PasswordChangeSchema,
  ResetPasswordSchema,
} from "../domain/auth.schema.js";
import type { UploadedDocument } from "../ports/document-store.port.js";
import type { DocumentStorePort } from "../ports/document-store.port.js";
import type { JobStorePort } from "../ports/job-store.port.js";
import type { QueuePort } from "../ports/queue.port.js";
import type { SqliteStore } from "./sqlite-store.js";
import type { AuthService } from "./auth-service.js";

interface HttpServerDeps {
  store: SqliteStore;
  auth: AuthService;
  documents: DocumentStorePort;
  jobs: JobStorePort;
  queue: QueuePort;
  dataDir: string;
  maxUploadBytes: number;
  staleWorkerMs: number;
  sseHeartbeatMs: number;
  appEnv: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

async function readBody(
  req: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new HttpError(413, "Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage, limit = 1024 * 1024): Promise<unknown> {
  const body = await readBody(req, limit);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function parseMultipart(req: IncomingMessage, body: Buffer): UploadedDocument[] {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) throw new HttpError(400, "Multipart boundary is required");
  const text = body.toString("latin1");
  const sections = text.split(`--${boundary}`);
  const documents: UploadedDocument[] = [];
  for (const rawSection of sections) {
    const section = rawSection.replace(/^\r\n/, "").replace(/\r\n--\s*$/, "");
    if (!section || section === "--\r\n") continue;
    const splitAt = section.indexOf("\r\n\r\n");
    if (splitAt < 0) continue;
    const headerText = section.slice(0, splitAt);
    const name = headerText.match(/name="([^"]+)"/i)?.[1];
    const filename = headerText.match(/filename="([^"]*)"/i)?.[1];
    if (name !== "files" || !filename) continue;
    let content = section.slice(splitAt + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    documents.push({
      originalName: filename,
      bytes: Buffer.from(content, "latin1"),
    });
  }
  if (documents.length === 0) throw new HttpError(400, "At least one PDF is required");
  return documents;
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function createHttpServer(deps: HttpServerDeps): http.Server {
  const { store, auth, documents, jobs } = deps;
  const maxBody = deps.maxUploadBytes * 12 + 1024 * 1024;

  const authenticate = (req: IncomingMessage) => {
    const token = getCookie(req, "session");
    const authenticated = token ? auth.authenticate(token) : null;
    if (!authenticated || !token) throw new HttpError(401, "Authentication required");
    return { ...authenticated, token };
  };

  const requireCsrf = (req: IncomingMessage, token: string) => {
    if (!auth.validateCsrf(token, req.headers["x-csrf-token"] as string | undefined)) {
      throw new HttpError(403, "Invalid CSRF token");
    }
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";

      if (method === "POST" && url.pathname === "/api/accounts") {
        const parsed = AccountInputSchema.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, "Invalid account details");
        try {
          const user = auth.register(parsed.data.email, parsed.data.password);
          sendJson(res, 201, { id: user.id, email: user.email });
        } catch (error) {
          if (String(error).toLowerCase().includes("unique")) {
            throw new HttpError(409, "An account already exists for this email");
          }
          throw error;
        }
        return;
      }

      if (method === "POST" && url.pathname === "/api/login") {
        const parsed = LoginInputSchema.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, "Invalid login details");
        try {
          const login = auth.login(parsed.data.email, parsed.data.password);
          res.setHeader(
            "set-cookie",
            sessionCookie(
              login.cookie.value,
              login.cookie.maxAgeSeconds,
              deps.appEnv === "production",
            ),
          );
          sendJson(res, 200, {
            user: { id: login.user.id, email: login.user.email },
            csrfToken: login.csrfToken,
          });
        } catch {
          throw new HttpError(401, "Invalid email or password");
        }
        return;
      }

      if (method === "POST" && url.pathname === "/api/logout") {
        const session = authenticate(req);
        requireCsrf(req, session.token);
        auth.logout(session.token);
        res.setHeader("set-cookie", sessionCookie("", 0, deps.appEnv === "production"));
        res.writeHead(204).end();
        return;
      }

      if (method === "GET" && url.pathname === "/api/session") {
        const session = authenticate(req);
        sendJson(res, 200, {
          user: session.user,
          csrfToken: session.csrfToken,
          expiresAt: session.session.expiresAt,
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/password/change") {
        const session = authenticate(req);
        requireCsrf(req, session.token);
        const body = await readJson(req);
        if (
          typeof body !== "object" ||
          body === null ||
          !("currentPassword" in body) ||
          typeof (body as { currentPassword?: unknown }).currentPassword !== "string"
        ) {
          throw new HttpError(403, "Current password is required");
        }
        const parsed = PasswordChangeSchema.safeParse(body);
        if (!parsed.success) throw new HttpError(400, "Invalid password payload");
        try {
          auth.changePassword(
            session.user.id,
            parsed.data.currentPassword,
            parsed.data.newPassword,
          );
          res.writeHead(200).end();
        } catch {
          throw new HttpError(403, "Current password is incorrect");
        }
        return;
      }

      if (method === "POST" && url.pathname === "/api/password/forgot") {
        const parsed = ForgotPasswordSchema.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, "Invalid email");
        auth.requestReset(parsed.data.email);
        res.writeHead(202).end();
        return;
      }

      if (method === "POST" && url.pathname === "/api/password/reset") {
        const parsed = ResetPasswordSchema.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, "Invalid reset payload");
        if (!auth.resetPassword(parsed.data.token, parsed.data.newPassword)) {
          throw new HttpError(400, "Reset token is invalid or expired");
        }
        res.writeHead(200).end();
        return;
      }

      if (method === "DELETE" && url.pathname === "/api/account") {
        const session = authenticate(req);
        requireCsrf(req, session.token);
        const owned = jobs.listOwnedJobs(session.user.id);
        store.deleteUser(session.user.id, Date.now());
        for (const item of owned) {
          await documents.deleteJobArtifacts(item.job.id);
        }
        res.setHeader("set-cookie", sessionCookie("", 0, deps.appEnv === "production"));
        res.writeHead(204).end();
        return;
      }

      if (
        method === "GET" &&
        url.pathname.startsWith("/api/dev/outbox/")
      ) {
        if (deps.appEnv !== "development" || !isLoopback(req.socket.remoteAddress)) {
          throw new HttpError(404, "Not found");
        }
        const id = url.pathname.slice("/api/dev/outbox/".length);
        if (!id) throw new HttpError(404, "Outbox message not found");
        sendJson(res, 200, auth.readOutboxPayload(id));
        return;
      }

      if (method === "POST" && url.pathname === "/api/jobs") {
        const session = authenticate(req);
        requireCsrf(req, session.token);
        const body = await readBody(req, maxBody);
        const staged = await documents.stage(parseMultipart(req, body));
        try {
          await documents.commit(staged);
          const job = jobs.createJob(
            session.user.id,
            staged.jobId,
            staged.documents.map((document) => ({
              sourceFile: document.sourceFile,
              storagePath: document.storagePath,
              sha256: document.sha256,
            })),
          );
          sendJson(res, 201, {
            id: job.id,
            state: job.state,
            sourceFiles: staged.documents.map((document) => document.sourceFile),
          });
        } catch (error) {
          await documents.discard(staged);
          throw error;
        }
        return;
      }

      if (method === "GET" && url.pathname === "/api/jobs") {
        const session = authenticate(req);
        sendJson(res, 200, jobs.listOwnedJobs(session.user.id));
        return;
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(result|csv|events))?$/);
      if (jobMatch) {
        const session = authenticate(req);
        const jobId = jobMatch[1]!;
        const action = jobMatch[2];
        const owned = jobs.getOwnedJob(jobId, session.user.id);
        if (!owned) throw new HttpError(404, "Job not found");

        if (method === "GET" && action === "events") {
          serveEvents(req, res, jobId, session.user.id, deps);
          return;
        }
        if (method === "GET" && action === "result") {
          sendJson(res, 200, {
            job: owned.job,
            records: owned.documents
              .filter((document) => document.state === "succeeded")
              .map((document) => document.record),
            errors: owned.documents
              .filter((document) => document.state === "failed")
              .map((document) => ({
                source_file: document.sourceFile,
                error: document.error,
              })),
          });
          return;
        }
        if (method === "GET" && action === "csv") {
          const receipt = jobs.getReceipt(jobId, session.user.id);
          if (!receipt) throw new HttpError(409, "CSV is not available");
          const bytes = await fs.readFile(receipt.outputPath);
          const actualHash = createHash("sha256").update(bytes).digest("hex");
          if (actualHash !== receipt.sha256) {
            throw new HttpError(500, "receipt hash mismatch");
          }
          res.writeHead(200, {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${jobId}.csv"`,
            "content-length": bytes.length,
          });
          res.end(bytes);
          return;
        }
        if (method === "GET" && !action) {
          sendJson(res, 200, owned);
          return;
        }
      }

      const mutationMatch = url.pathname.match(
        /^\/api\/jobs\/([^/]+)\/(retry|cancel)$/,
      );
      if (method === "POST" && mutationMatch) {
        const session = authenticate(req);
        requireCsrf(req, session.token);
        const jobId = mutationMatch[1]!;
        if (mutationMatch[2] === "retry") {
          sendJson(res, 200, jobs.requestRetry(jobId, session.user.id));
        } else {
          sendJson(res, 200, {
            state: jobs.requestCancel(jobId, session.user.id),
          });
        }
        return;
      }

      if (method === "GET" && url.pathname === "/health/ready") {
        if (!store.isDatabaseUsable()) {
          sendJson(res, 503, { status: "failed" });
          return;
        }
        const heartbeat = store.latestWorkerHeartbeat();
        if (!heartbeat) {
          sendJson(res, 503, { status: "degraded" });
          return;
        }
        const status =
          Date.now() - heartbeat > deps.staleWorkerMs ? "degraded" : "ready";
        sendJson(res, status === "ready" ? 200 : 503, { status, heartbeat });
        return;
      }

      if (method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/app"))) {
        await serveWebFile(deps.dataDir, url.pathname, res);
        return;
      }

      if (
        method === "GET" &&
        (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.ico")
      ) {
        await serveWebFile(deps.dataDir, url.pathname, res);
        return;
      }

      throw new HttpError(404, "Not found");
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }

      console.error(error);
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal error" });
    }
  });
}

async function serveWebFile(
  _dataDir: string,
  requestPath: string,
  res: ServerResponse,
): Promise<void> {
  const webRoot = path.resolve(process.cwd(), "web", "dist");
  const relative =
    requestPath === "/" || requestPath.startsWith("/app")
      ? "index.html"
      : requestPath.replace(/^\//, "");
  const filePath = path.resolve(webRoot, relative);
  if (!filePath.startsWith(`${webRoot}${path.sep}`)) {
    throw new HttpError(404, "Not found");
  }
  try {
    const data = await fs.readFile(filePath);
    const contentType = filePath.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : filePath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : filePath.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": data.length,
      "cache-control": filePath.endsWith(".html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    throw new HttpError(
      404,
      "Dashboard build not found. Run npm run web:build.",
    );
  }
}

function serveEvents(
  req: IncomingMessage,
  res: ServerResponse,
  jobId: string,
  ownerUserId: string,
  deps: HttpServerDeps,
): void {
  let cursor = Number.parseInt(
    (req.headers["last-event-id"] as string | undefined) ?? "0",
    10,
  );
  if (!Number.isFinite(cursor)) cursor = 0;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write("retry: 1000\n\n");

  const stream = () => {
    if (res.destroyed) return;
    const events = deps.jobs.listEvents(jobId, ownerUserId, cursor);
    for (const event of events) {
      cursor = event.id;
      res.write(`id: ${event.id}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };
  stream();
  const eventsTimer = setInterval(stream, 1000);
  const heartbeatTimer = setInterval(() => {
    if (!res.destroyed) res.write(": heartbeat\n\n");
  }, deps.sseHeartbeatMs);
  eventsTimer.unref?.();
  heartbeatTimer.unref?.();
  req.on("close", () => {
    clearInterval(eventsTimer);
    clearInterval(heartbeatTimer);
  });
}
