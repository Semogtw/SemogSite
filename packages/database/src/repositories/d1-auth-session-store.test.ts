import type { AuthSessionRecord } from "@semogtw/auth";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1AuthSessionStore } from "./d1-auth-session-store";

type OwnerRow = {
  id: string;
  displayName: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

class FakeStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: FakeD1Binding,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new FakeStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return this.database.first(this.sql, this.params) as Row | null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }

  async run(): Promise<D1QueryResult> {
    this.database.run(this.sql, this.params);
    return { results: [], success: true };
  }
}

class FakeD1Binding implements D1DatabaseBinding {
  readonly owners = new Map<string, OwnerRow>();
  readonly sessions = new Map<string, AuthSessionRecord>();
  readonly batches: FakeStatement[][] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new FakeStatement(this, query);
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    const typed = statements as readonly FakeStatement[];
    this.batches.push([...typed]);
    const ownerSnapshot = structuredClone([...this.owners]);
    const sessionSnapshot = structuredClone([...this.sessions]);
    try {
      for (const statement of typed) this.run(statement.sql, statement.params);
      return typed.map(() => ({ results: [], success: true }));
    } catch (error) {
      this.owners.clear();
      this.sessions.clear();
      for (const [key, value] of ownerSnapshot) this.owners.set(key, value);
      for (const [key, value] of sessionSnapshot) this.sessions.set(key, value);
      throw error;
    }
  }

  run(sql: string, params: readonly unknown[]): void {
    if (sql.includes("EXISTS") && sql.includes("UPDATE auth_sessions")) {
      const [revokedAt, ownerId, lookupOwnerId, nextPasswordHash] = params as [
        string,
        string,
        string,
        string,
      ];
      const owner = this.owners.get(lookupOwnerId);
      if (owner !== undefined && owner.passwordHash !== nextPasswordHash) {
        for (const [id, session] of this.sessions) {
          if (session.ownerId === ownerId && session.revokedAt === null) {
            this.sessions.set(id, { ...session, revokedAt });
          }
        }
      }
      return;
    }

    if (sql.includes("INSERT INTO owner_accounts")) {
      const [id, displayName, passwordHash, createdAt, updatedAt] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const existing = this.owners.get(id);
      this.owners.set(id, {
        id,
        displayName,
        passwordHash,
        active: true,
        createdAt: existing?.createdAt ?? createdAt,
        updatedAt,
      });
      return;
    }

    if (sql.includes("INSERT INTO auth_sessions")) {
      const [id, ownerId, tokenDigest, createdAt, expiresAt, revokedAt] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
      ];
      if (!this.owners.has(ownerId)) throw new Error("FOREIGN_KEY");
      this.sessions.set(id, {
        id,
        ownerId,
        tokenDigest,
        createdAt,
        expiresAt,
        revokedAt,
      });
      return;
    }

    if (sql.includes("SET revoked_at = ?") && sql.includes("WHERE id = ?")) {
      const [revokedAt, sessionId] = params as [string, string];
      const session = this.sessions.get(sessionId);
      if (session !== undefined) {
        this.sessions.set(sessionId, { ...session, revokedAt });
      }
      return;
    }

    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }

  first(sql: string, params: readonly unknown[]): Record<string, unknown> | null {
    if (!sql.includes("FROM auth_sessions")) {
      throw new Error(`UNEXPECTED_SQL: ${sql}`);
    }
    const [tokenDigest, now] = params as [string, string];
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.tokenDigest === tokenDigest &&
        candidate.revokedAt === null &&
        candidate.expiresAt > now,
    );
    return session === undefined ? null : { ...session };
  }
}

function session(
  id: string,
  tokenDigest: string,
  expiresAt: string,
): AuthSessionRecord {
  return {
    id,
    ownerId: "semogtw-owner",
    tokenDigest,
    createdAt: "2026-08-05T12:00:00.000Z",
    expiresAt,
    revokedAt: null,
  };
}

describe("D1AuthSessionStore", () => {
  it("bootstraps the owner and revokes active sessions only when the hash changes", async () => {
    const binding = new FakeD1Binding();
    const store = new D1AuthSessionStore(binding);
    const firstSeenAt = new Date("2026-08-05T12:00:00.000Z");

    await store.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw",
      passwordHash: "hash-a",
      now: firstSeenAt,
    });
    await store.insert(session("session-a", "digest-a", "2026-08-06T12:00:00.000Z"));

    await store.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw atualizado",
      passwordHash: "hash-a",
      now: new Date("2026-08-05T13:00:00.000Z"),
    });
    expect(binding.sessions.get("session-a")?.revokedAt).toBeNull();

    await store.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw atualizado",
      passwordHash: "hash-b",
      now: new Date("2026-08-05T14:00:00.000Z"),
    });

    expect(binding.owners.get("semogtw-owner")).toMatchObject({
      displayName: "Semogtw atualizado",
      passwordHash: "hash-b",
      createdAt: firstSeenAt.toISOString(),
      updatedAt: "2026-08-05T14:00:00.000Z",
    });
    expect(binding.sessions.get("session-a")?.revokedAt).toBe(
      "2026-08-05T14:00:00.000Z",
    );
    expect(binding.batches).toHaveLength(3);
    expect(binding.batches[0]?.[0]?.sql).toContain("UPDATE auth_sessions");
    expect(binding.batches[0]?.[1]?.sql).toContain("INSERT INTO owner_accounts");
  });

  it("returns only unrevoked, unexpired sessions and supports explicit revocation", async () => {
    const binding = new FakeD1Binding();
    const store = new D1AuthSessionStore(binding);
    await store.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw",
      passwordHash: "hash-a",
      now: new Date("2026-08-05T12:00:00.000Z"),
    });
    await store.insert(session("active", "active-digest", "2026-08-06T12:00:00.000Z"));
    await store.insert(session("expired", "expired-digest", "2026-08-05T11:59:59.000Z"));

    await expect(
      store.findActiveByTokenDigest(
        "active-digest",
        new Date("2026-08-05T12:30:00.000Z"),
      ),
    ).resolves.toEqual(session("active", "active-digest", "2026-08-06T12:00:00.000Z"));
    await expect(
      store.findActiveByTokenDigest(
        "expired-digest",
        new Date("2026-08-05T12:30:00.000Z"),
      ),
    ).resolves.toBeNull();

    await store.revoke("active", new Date("2026-08-05T13:00:00.000Z"));
    await expect(
      store.findActiveByTokenDigest(
        "active-digest",
        new Date("2026-08-05T13:00:01.000Z"),
      ),
    ).resolves.toBeNull();
  });

  it("preserves the owner foreign-key boundary for session inserts", async () => {
    const store = new D1AuthSessionStore(new FakeD1Binding());
    await expect(
      store.insert(session("orphan", "digest", "2026-08-06T12:00:00.000Z")),
    ).rejects.toThrow("FOREIGN_KEY");
  });
});
