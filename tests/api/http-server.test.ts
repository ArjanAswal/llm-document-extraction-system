import fs from "fs/promises";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/services/auth-service.js";
import { FileDocumentStore } from "../../src/services/document-store.js";
import { createHttpServer } from "../../src/services/http-server.js";
import { createDatabase } from "../../src/services/sqlite-database.js";
import { SqliteStore } from "../../src/services/sqlite-store.js";

const PDF_BYTES = Buffer.from("%PDF-1.7\nfixture\n%%EOF");

describe("HTTP application", () => {
  let tempDir: string;
  let db: DatabaseSync;
  let store: SqliteStore;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.OUTBOX_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-http-"));
    db = createDatabase(tempDir);
    store = new SqliteStore(db, 5);
    server = createHttpServer({
      store,
      auth: new AuthService(store),
      documents: new FileDocumentStore(tempDir, 1024 * 1024),
      jobs: store,
      queue: store,
      dataDir: tempDir,
      maxUploadBytes: 1024 * 1024,
      staleWorkerMs: 15_000,
      sseHeartbeatMs: 100,
      appEnv: "development",
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    delete process.env.OUTBOX_ENCRYPTION_KEY;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("enforces account sessions and cross-account job ownership", async () => {
    const first = await registerAndLogin("a@example.test", "LongPassword123!");
    const second = await registerAndLogin("b@example.test", "LongPassword456!");

    const upload = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: {
        cookie: first.cookie,
        "x-csrf-token": first.csrfToken,
        "content-type": `multipart/form-data; boundary=${"boundary"}`,
      },
      body: multipart([
        { name: "invoice.pdf", content: PDF_BYTES },
      ]),
    });
    expect(upload.status).toBe(201);
    const uploaded = (await upload.json()) as { id: string };

    const own = await fetch(`${baseUrl}/api/jobs/${uploaded.id}`, {
      headers: { cookie: first.cookie },
    });
    expect(own.status).toBe(200);

    const foreign = await fetch(`${baseUrl}/api/jobs/${uploaded.id}`, {
      headers: { cookie: second.cookie },
    });
    expect(foreign.status).toBe(404);

    const noSession = await fetch(`${baseUrl}/api/jobs`);
    expect(noSession.status).toBe(401);
  });

  it("revokes sessions and exposes reset links only through loopback development mode", async () => {
    const account = await registerAndLogin("a@example.test", "LongPassword123!");

    const forgot = await fetch(`${baseUrl}/api/password/forgot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.test" }),
    });
    expect(forgot.status).toBe(202);

    const outbox = db
      .prepare("SELECT id, encrypted_payload FROM email_outbox")
      .get() as { id: string; encrypted_payload: string };
    expect(outbox.encrypted_payload).not.toContain("token=");

    const recovered = await fetch(
      `${baseUrl}/api/dev/outbox/${outbox.id}`,
    );
    expect(recovered.status).toBe(200);
    expect((await recovered.json()) as { link: string }).toHaveProperty("link");

    const logout = await fetch(`${baseUrl}/api/logout`, {
      method: "POST",
      headers: {
        cookie: account.cookie,
        "x-csrf-token": account.csrfToken,
      },
    });
    expect(logout.status).toBe(204);
    const afterLogout = await fetch(`${baseUrl}/api/session`, {
      headers: { cookie: account.cookie },
    });
    expect(afterLogout.status).toBe(401);
  });

  async function registerAndLogin(email: string, password: string) {
    const register = await fetch(`${baseUrl}/api/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(register.status).toBe(201);
    const login = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const payload = (await login.json()) as { csrfToken: string };
    return { cookie, csrfToken: payload.csrfToken };
  }
});

function multipart(files: { name: string; content: Buffer }): Buffer {
  const boundary = "boundary";
  const chunks = files.flatMap((file) => [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n`,
    "Content-Type: application/pdf\r\n\r\n",
    file.content,
    "\r\n",
  ]);
  chunks.push(`--${boundary}--\r\n`);
  return Buffer.concat(
    chunks.map((chunk) =>
      typeof chunk === "string" ? Buffer.from(chunk) : chunk,
    ),
  );
}
