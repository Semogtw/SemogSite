import { describe, expect, it } from "vitest";
import { LocalAuthProvider } from "./local-provider";
import { hashOwnerPassword } from "./password";
import type { AuthSessionRecord, AuthSessionStore } from "./session";

class MemorySessionStore implements AuthSessionStore {
  readonly rows: AuthSessionRecord[] = [];

  async insert(record: AuthSessionRecord): Promise<void> {
    this.rows.push(record);
  }

  async findActiveByTokenDigest(
    tokenDigest: string,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.tokenDigest === tokenDigest &&
          row.revokedAt === null &&
          new Date(row.expiresAt).getTime() > now.getTime(),
      ) ?? null
    );
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    const record = this.rows.find((row) => row.id === sessionId);
    if (record) record.revokedAt = revokedAt.toISOString();
  }
}

describe("LocalAuthProvider", () => {
  it("stores only the token digest and supports revocation", async () => {
    const sessions = new MemorySessionStore();
    const provider = new LocalAuthProvider({
      ownerId: "owner",
      encodedPasswordHash: await hashOwnerPassword(
        "correct horse battery staple",
      ),
      sessions,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });

    const result = await provider.authenticate({
      password: "correct horse battery staple",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");

    expect(sessions.rows[0]?.tokenDigest).not.toContain(result.rawToken);
    await expect(provider.resolveSession(result.rawToken)).resolves.toMatchObject({
      id: "owner",
      sessionId: result.session.id,
    });

    await provider.revokeSession(result.session.id);
    await expect(provider.resolveSession(result.rawToken)).resolves.toBeNull();
  });

  it("returns a generic failure for an invalid password", async () => {
    const provider = new LocalAuthProvider({
      ownerId: "owner",
      encodedPasswordHash: await hashOwnerPassword("expected password"),
      sessions: new MemorySessionStore(),
    });

    await expect(
      provider.authenticate({ password: "wrong password" }),
    ).resolves.toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });
});
