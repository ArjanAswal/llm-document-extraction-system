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
  let auth: AuthService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.OUTBOX_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-http-"));
    db = createDatabase(tempDir);
    store = new SqliteStore(db, 5);
    auth = new AuthService(store);
    server = createHttpServer({
      store,
      auth,
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

  it("changes and resets passwords with full session revocation", async () => {
    const account = await registerAndLogin("a@example.test", "LongPassword123!");
    const changed = await fetch(`${baseUrl}/api/password/change`, {
      method: "POST",
      headers: {
        cookie: account.cookie,
        "x-csrf-token": account.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "LongPassword123!",
        newPassword: "NewLongPassword456!",
      }),
    });
    expect(changed.status).toBe(200);
    expect(
      await fetch(`${baseUrl}/api/session`, {
        headers: { cookie: account.cookie },
      }).then((response) => response.status),
    ).toBe(401);

    await fetch(`${baseUrl}/api/password/forgot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.test" }),
    });
    const row = db
      .prepare("SELECT id FROM email_outbox ORDER BY created_at DESC LIMIT 1")
      .get() as { id: string };
    const payload = auth.readOutboxPayload(row.id) as { link: string };
    const token = new URL(payload.link).searchParams.get("token")!;
    const reset = await fetch(`${baseUrl}/api/password/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: "ResetPassword789!" }),
    });
    expect(reset.status).toBe(200);
    const old = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "a@example.test",
        password: "NewLongPassword456!",
      }),
    });
    expect(old.status).toBe(401);
  });

  it("returns 403 for a missing current password without changing credentials", async () => {
    const account = await registerAndLogin("a@example.test", "LongPassword123!");
    const response = await fetch(`${baseUrl}/api/password/change`, {
      method: "POST",
      headers: {
        cookie: account.cookie,
        "x-csrf-token": account.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ newPassword: "NewLongPassword456!" }),
    });
    expect(response.status).toBe(403);
    expect(
      await fetch(`${baseUrl}/api/session`, {
        headers: { cookie: account.cookie },
      }).then((result) => result.status),
    ).toBe(200);
  });

  it("makes deleted-account jobs inaccessible", async () => {
    const account = await registerAndLogin("a@example.test", "LongPassword123!");
    const upload = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: {
        cookie: account.cookie,
        "x-csrf-token": account.csrfToken,
        "content-type": `multipart/form-data; boundary=${"boundary"}`,
      },
      body: multipart([{ name: "invoice.pdf", content: PDF_BYTES }]),
    });
    const { id } = (await upload.json()) as { id: string };
    const deletion = await fetch(`${baseUrl}/api/account`, {
      method: "DELETE",
      headers: {
        cookie: account.cookie,
        "x-csrf-token": account.csrfToken,
      },
    });
    expect(deletion.status).toBe(204);
    expect(
      await fetch(`${baseUrl}/api/jobs/${id}`, {
        headers: { cookie: account.cookie },
      }).then((response) => response.status),
    ).toBe(401);
    const persisted = store.getJob(id);
    expect(persisted?.state).toBe("cancelled");
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
