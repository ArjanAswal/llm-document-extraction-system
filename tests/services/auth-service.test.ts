import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/services/auth-service.js";
import { createDatabase } from "../../src/services/sqlite-database.js";
import { SqliteStore } from "../../src/services/sqlite-store.js";

describe("AuthService", () => {
  let tempDir: string;
  let store: SqliteStore;
  let auth: AuthService;

  beforeEach(async () => {
    process.env.OUTBOX_ENCRYPTION_KEY =
      "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-auth-"));
    store = new SqliteStore(createDatabase(tempDir), 5);
    auth = new AuthService(store);
  });

  afterEach(async () => {
    delete process.env.OUTBOX_ENCRYPTION_KEY;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates, authenticates, and revokes sessions", () => {
    const user = auth.register("person@example.test", "LongPassword123!");
    const login = auth.login(user.email, "LongPassword123!");
    const authenticated = auth.authenticate(login.cookie.value);

    expect(authenticated?.user.id).toBe(user.id);
    expect(auth.validateCsrf(login.cookie.value, login.csrfToken)).toBe(true);

    auth.logout(login.cookie.value);
    expect(auth.authenticate(login.cookie.value)).toBeNull();
  });

  it("changes password and revokes prior sessions", () => {
    const user = auth.register("person@example.test", "LongPassword123!");
    const login = auth.login(user.email, "LongPassword123!");
    auth.changePassword(user.id, "LongPassword123!", "NewPassword456!");

    expect(auth.authenticate(login.cookie.value)).toBeNull();
    expect(() => auth.login(user.email, "LongPassword123!")).toThrow();
    expect(auth.login(user.email, "NewPassword456!").user.id).toBe(user.id);
  });

  it("encrypts recoverable password-reset outbox payloads", () => {
    const user = auth.register("person@example.test", "LongPassword123!");
    const message = auth.requestReset(user.email)!;

    expect(message.encryptedPayload).not.toContain("person@example.test");
    expect(auth.readOutboxPayload(message.id)).toMatchObject({
      to: user.email,
      kind: "password_reset",
    });
  });
});
