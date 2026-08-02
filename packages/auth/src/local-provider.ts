import type {
  AuthProvider,
  AuthResult,
  AuthenticatedOwner,
  OwnerCredentials,
} from "./provider";
import { verifyOwnerPassword } from "./password";
import {
  digestSessionToken,
  type AuthSessionRecord,
  type AuthSessionStore,
} from "./session";

const DEFAULT_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export type LocalAuthProviderOptions = {
  ownerId: string;
  encodedPasswordHash: string;
  sessions: AuthSessionStore;
  now?: () => Date;
  sessionLifetimeMs?: number;
};

export class LocalAuthProvider implements AuthProvider {
  readonly #ownerId: string;
  readonly #encodedPasswordHash: string;
  readonly #sessions: AuthSessionStore;
  readonly #now: () => Date;
  readonly #sessionLifetimeMs: number;

  constructor(options: LocalAuthProviderOptions) {
    this.#ownerId = options.ownerId;
    this.#encodedPasswordHash = options.encodedPasswordHash;
    this.#sessions = options.sessions;
    this.#now = options.now ?? (() => new Date());
    this.#sessionLifetimeMs =
      options.sessionLifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
  }

  async authenticate(credentials: OwnerCredentials): Promise<AuthResult> {
    if (this.#encodedPasswordHash.trim().length === 0) {
      return { ok: false, reason: "AUTH_NOT_CONFIGURED" };
    }

    const valid = await verifyOwnerPassword(
      credentials.password,
      this.#encodedPasswordHash,
    );
    if (!valid) return { ok: false, reason: "INVALID_CREDENTIALS" };

    const now = this.#now();
    const expiresAt = new Date(now.getTime() + this.#sessionLifetimeMs);
    const rawToken = toBase64Url(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const session: AuthSessionRecord = {
      id: crypto.randomUUID(),
      ownerId: this.#ownerId,
      tokenDigest: await digestSessionToken(rawToken),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    };

    await this.#sessions.insert(session);

    return {
      ok: true,
      rawToken,
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    };
  }

  async resolveSession(rawToken: string): Promise<AuthenticatedOwner | null> {
    if (rawToken.length === 0) return null;
    const record = await this.#sessions.findActiveByTokenDigest(
      await digestSessionToken(rawToken),
      this.#now(),
    );
    if (record === null) return null;

    return {
      id: record.ownerId,
      sessionId: record.id,
      expiresAt: record.expiresAt,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.#sessions.revoke(sessionId, this.#now());
  }
}
