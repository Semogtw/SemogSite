import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "@semogtw/database/d1";
import { describe, expect, it } from "vitest";
import { createD1ApiRuntime } from "../src/composition/d1";

const validHash =
  "pbkdf2-sha256$310000$AQIDBAUGBwgJCgsMDQ4PEA$XIN4Q-dDSXIV3hDVJdpOvUlb3nFS3GXS-g7wNMNsdis";

class ReadinessStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: ReadinessBinding,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new ReadinessStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    if (this.sql.includes("SELECT COUNT(*) AS count FROM login_rate_limits")) {
      if (!this.database.loginRateLimitTableAvailable) {
        throw new Error("D1_ERROR: no such table: login_rate_limits");
      }
      return { count: 0 } as Row;
    }
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class ReadinessBinding implements D1DatabaseBinding {
  constructor(readonly loginRateLimitTableAvailable = true) {}

  prepare(query: string): D1PreparedStatementBinding {
    return new ReadinessStatement(this, query);
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    return statements.map(() => ({ results: [], success: true }));
  }
}

function configuredBindings(database: D1DatabaseBinding) {
  return {
    DB: database,
    NODE_ENV: "test",
    SEMOGTW_OWNER_PASSWORD_HASH: validHash,
    SEMOGTW_SESSION_SECRET: "s".repeat(32),
  } as const;
}

describe("D1 runtime readiness", () => {
  it("stays not ready when owner authentication secrets are absent", async () => {
    const runtime = await createD1ApiRuntime({ DB: new ReadinessBinding() });
    const response = await runtime.app.request("/ready");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "SERVICE_NOT_READY" },
    });
  });

  it("becomes ready only when auth composes and migration 0014 is queryable", async () => {
    const runtime = await createD1ApiRuntime(
      configuredBindings(new ReadinessBinding()),
    );
    const response = await runtime.app.request("/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "semogtw-api",
      status: "ready",
    });
  });

  it("fails closed when the login-rate-limit table is unavailable", async () => {
    const runtime = await createD1ApiRuntime(
      configuredBindings(new ReadinessBinding(false)),
    );
    const response = await runtime.app.request("/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "SERVICE_NOT_READY" },
    });
  });
});
