import {
  SESSION_COOKIE_NAME,
  type AuthSessionRecord,
} from "@semogtw/auth";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "@semogtw/database/d1";
import { describe, expect, it } from "vitest";
import { createD1ApiRuntime } from "../src/composition/d1";

const validHash =
  "pbkdf2-sha256$310000$AQIDBAUGBwgJCgsMDQ4PEA$XIN4Q-dDSXIV3hDVJdpOvUlb3nFS3GXS-g7wNMNsdis";

type OwnerRow = {
  id: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

class RuntimeStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: RuntimeBinding,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new RuntimeStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return this.database.first(this.sql, this.params) as Row | null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return this.database.rowsFor(this.sql, this.params) as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    this.database.run(this.sql, this.params);
    return { results: [], success: true };
  }
}

class RuntimeBinding implements D1DatabaseBinding {
  readonly owners = new Map<string, OwnerRow>();
  readonly sessions = new Map<string, AuthSessionRecord>();
  batchCount = 0;

  prepare(query: string): D1PreparedStatementBinding {
    return new RuntimeStatement(this, query);
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batchCount += 1;
    for (const statement of statements as readonly RuntimeStatement[]) {
      this.run(statement.sql, statement.params);
    }
    return statements.map(() => ({ results: [], success: true }));
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
      const [id, , passwordHash, createdAt, updatedAt] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const existing = this.owners.get(id);
      this.owners.set(id, {
        id,
        passwordHash,
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
      const [revokedAt, id] = params as [string, string];
      const session = this.sessions.get(id);
      if (session !== undefined) this.sessions.set(id, { ...session, revokedAt });
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

  rowsFor(
    sql: string,
    params: readonly unknown[],
  ): readonly (readonly unknown[])[] {
    if (sql.includes('from "projects"') && sql.includes('"status" = ?')) {
      return [[
        "project-a",
        "project-a",
        "Projeto A",
        "high",
        "healthy",
        80,
        "Foco D1",
        "Continuar integração",
        "main",
        "2026-08-05T12:00:00.000Z",
        "2026-08-05T12:30:00.000Z",
      ]];
    }
    if (sql.includes('from "projects"')) {
      return [[
        "project-a",
        "project-a",
        "Projeto A",
        null,
        "active",
        "healthy",
        "high",
        80,
        "Foco D1",
        "Continuar integração",
        "main",
        "manual",
        "high",
        "public",
        "Resumo público",
        null,
        75,
        1,
        null,
        "https://example.com",
        null,
        "2026-08-05T12:00:00.000Z",
        "2026-08-05T12:30:00.000Z",
        0,
        "manual",
        "2026-08-05T12:00:00.000Z",
        "2026-08-05T12:30:00.000Z",
      ]];
    }
    if (sql.includes('from "stages"')) {
      return [["stage-a", "project-a", "Integrar Worker", "in_progress", 60, 1]];
    }
    if (sql.includes('from "attention_items"')) {
      return [[
        "attention-a",
        "project-a",
        "Aplicar migrations remotas",
        "high",
        "owner",
        "Validar backup antes",
      ]];
    }
    if (sql.includes('from "sync_runs"')) {
      return [["2026-08-05T12:30:00.000Z"]];
    }
    throw new Error(`UNEXPECTED_SQL: ${sql} / ${JSON.stringify(params)}`);
  }
}

describe("authenticated D1 API runtime", () => {
  it("stays fail-closed when Worker secrets are absent", async () => {
    const binding = new RuntimeBinding();
    const runtime = await createD1ApiRuntime({ DB: binding });

    expect(runtime.authProvider).toBeUndefined();
    const response = await runtime.app.request("/api/v1/private/overview");
    expect(response.status).toBe(401);
    expect(binding.batchCount).toBe(0);
  });

  it("bootstraps one cached owner runtime and serves D1 overview to a valid session", async () => {
    const binding = new RuntimeBinding();
    const bindings = {
      DB: binding,
      NODE_ENV: "test",
      SEMOGTW_OWNER_PASSWORD_HASH: validHash,
      SEMOGTW_SESSION_SECRET: "s".repeat(32),
    } as const;
    const runtime = await createD1ApiRuntime(bindings);
    const cached = await createD1ApiRuntime(bindings);

    expect(cached).toBe(runtime);
    expect(binding.batchCount).toBe(1);
    expect(runtime.authProvider).not.toBeUndefined();

    const login = await runtime.app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.20",
      },
      body: JSON.stringify({
        password: "correct horse battery staple",
      }),
    });
    expect(login.status).toBe(200);
    const cookieHeader = login.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    const response = await runtime.app.request(
      "/api/v1/private/overview",
      {
        headers: { cookie: cookieHeader },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        activeProjectCount: 1,
        inProgressStageCount: 1,
        highImpactAttentionCount: 1,
        lastSyncedAt: "2026-08-05T12:30:00.000Z",
      },
    });
  });
});
