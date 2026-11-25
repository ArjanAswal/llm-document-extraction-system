import type { Session, User } from "../domain/auth.schema.js";

export interface CredentialRecord extends User {
  passwordHash: string;
  passwordSalt: string;
}

export interface SessionRecord extends Session {
  tokenHash: string;
  revokedAt: number | null;
}

export interface OutboxMessage {
  id: string;
  userId: string;
  kind: "password_reset";
  encryptedPayload: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
}

export interface AuthStorePort {
  createUser(email: string, passwordHash: string, passwordSalt: string): User;
  findUserByEmail(email: string): CredentialRecord | null;
  findUserById(id: string): User | null;
  updatePassword(userId: string, passwordHash: string, passwordSalt: string): void;
  deleteUser(userId: string, now: number): void;

  createSession(userId: string, tokenHash: string, expiresAt: number): Session;
  findSession(tokenHash: string, now: number): SessionRecord | null;
  revokeSession(tokenHash: string, now: number): void;
  revokeUserSessions(userId: string, now: number): void;

  createPasswordReset(
    userId: string,
    tokenHash: string,
    encryptedPayload: string,
    expiresAt: number,
  ): OutboxMessage;
  consumePasswordReset(tokenHash: string, now: number): OutboxMessage | null;
  findOutboxMessage(id: string): OutboxMessage | null;
}
