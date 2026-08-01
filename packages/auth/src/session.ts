export type AuthSessionRecord = {
  id: string;
  ownerId: string;
  tokenDigest: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export interface AuthSessionStore {
  insert(record: AuthSessionRecord): Promise<void>;
  findActiveByTokenDigest(
    tokenDigest: string,
    now: Date,
  ): Promise<AuthSessionRecord | null>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
}

const encoder = new TextEncoder();

export async function digestSessionToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
