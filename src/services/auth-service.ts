import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import type { AuthStorePort, OutboxMessage } from "../ports/auth-store.port.js";
import type { Session, User } from "../domain/auth.schema.js";

const SCRYPT_KEY_LENGTH = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export interface AuthCookie {
  name: string;
  value: string;
  maxAgeSeconds: number;
}

export interface AuthenticatedSession {
  session: Session;
  user: User;
  csrfToken: string;
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function csrfTokenFor(sessionToken: string): string {
  return hashToken(`csrf:${sessionToken}`);
}

function keyFromBase64(encoded: string | undefined): Buffer {
  if (!encoded) throw new Error("OUTBOX_ENCRYPTION_KEY is required");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("OUTBOX_ENCRYPTION_KEY must be base64 encoding of 32 bytes");
  }
  return key;
}

export class AuthService {
  constructor(
    private readonly store: AuthStorePort,
    private readonly appOrigin = "http://localhost:3000",
  ) {}

  register(email: string, password: string): User {
    if (password.length < 12 || password.length > 256) {
      throw new Error("Password must be 12 to 256 characters");
    }
    const salt = randomBytes(16).toString("base64url");
    const passwordHash = this.hashPassword(password, salt);
    return this.store.createUser(email.trim().toLowerCase(), passwordHash, salt);
  }

  login(email: string, password: string): {
    user: User;
    cookie: AuthCookie;
    csrfToken: string;
  } {
    const user = this.store.findUserByEmail(email.trim().toLowerCase());
    if (!user?.active || !this.verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw new Error("Invalid email or password");
    }
    const rawToken = randomBytes(32).toString("base64url");
    const session = this.store.createSession(
      user.id,
      hashToken(rawToken),
      Date.now() + SESSION_TTL_MS,
    );
    return {
      user: user as User,
      cookie: {
        name: "session",
        value: rawToken,
        maxAgeSeconds: Math.floor((session.expiresAt - Date.now()) / 1000),
      },
      csrfToken: csrfTokenFor(rawToken),
    };
  }

  authenticate(rawToken: string): AuthenticatedSession | null {
    const record = this.store.findSession(hashToken(rawToken), Date.now());
    if (!record) return null;
    const user = this.store.findUserById(record.userId);
    if (!user?.active) return null;
    return {
      session: record,
      user,
      csrfToken: csrfTokenFor(rawToken),
    };
  }

  logout(rawToken: string): void {
    this.store.revokeSession(hashToken(rawToken), Date.now());
  }

  validateCsrf(rawToken: string, provided: string | undefined): boolean {
    if (!provided) return false;
    const expected = Buffer.from(csrfTokenFor(rawToken));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): void {
    const user = this.store.findUserById(userId);
    const credential = user ? this.store.findUserByEmail(user.email) : null;
    if (
      !credential ||
      !this.verifyPassword(currentPassword, credential.passwordSalt, credential.passwordHash)
    ) {
      throw new Error("Current password is incorrect");
    }
    if (newPassword.length < 12 || newPassword.length > 256) {
      throw new Error("Password must be 12 to 256 characters");
    }
    const salt = randomBytes(16).toString("base64url");
    this.store.updatePassword(userId, this.hashPassword(newPassword, salt), salt);
    this.store.revokeUserSessions(userId, Date.now());
  }

  requestReset(email: string): OutboxMessage | null {
    const user = this.store.findUserByEmail(email.trim().toLowerCase());
    if (!user?.active) return null;
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + RESET_TTL_MS;
    const payload = {
      to: user.email,
      kind: "password_reset",
      link: `${this.appOrigin}/reset-password?token=${rawToken}`,
      expiresAt,
    };
    return this.store.createPasswordReset(
      user.id,
      hashToken(rawToken),
      this.encryptPayload(payload),
      expiresAt,
    );
  }

  resetPassword(token: string, newPassword: string): boolean {
    if (newPassword.length < 12 || newPassword.length > 256) {
      throw new Error("Password must be 12 to 256 characters");
    }
    const reset = this.store.consumePasswordReset(hashToken(token), Date.now());
    if (!reset) return false;
    const salt = randomBytes(16).toString("base64url");
    this.store.updatePassword(reset.userId, this.hashPassword(newPassword, salt), salt);
    this.store.revokeUserSessions(reset.userId, Date.now());
    return true;
  }

  readOutboxPayload(id: string): unknown {
    const message = this.store.findOutboxMessage(id);
    if (!message) throw new Error("Outbox message not found");
    return this.decryptPayload(message.encryptedPayload);
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("base64url");
  }

  private verifyPassword(password: string, salt: string, expected: string): boolean {
    const actualBytes = Buffer.from(this.hashPassword(password, salt), "base64url");
    const expectedBytes = Buffer.from(expected, "base64url");
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  }

  private encryptPayload(payload: unknown): string {
    const key = keyFromBase64(process.env.OUTBOX_ENCRYPTION_KEY);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  private decryptPayload(encoded: string): unknown {
    const key = keyFromBase64(process.env.OUTBOX_ENCRYPTION_KEY);
    const [ivRaw, tagRaw, ciphertextRaw] = encoded.split(".");
    if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Invalid outbox payload");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  }
}
