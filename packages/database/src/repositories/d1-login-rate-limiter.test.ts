import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1LoginRateLimiter } from "./d1-login-rate-limiter";

type RateLimitRow = {
  keyDigest: string;
  windowStartedAt: string;
  attemptCount: number;
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
  readonly rows = new Map<string, RateLimitRow>();
  readonly rawKeys = new Set<string>();

  prepare(query: string): D1PreparedStatementBinding {
    return new FakeStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  first(sql: string, params: readonly unknown[]): Record<string, unknown> | null {
    if (!sql.includes("INSERT INTO login_rate_limits")) {
      throw new Error(`UNEXPECTED_SQL: ${sql}`);
    }

    const [keyDigest, now, updatedAt, cutoff] = params as [
      string,
      string,
      string,
      string,
      string,
    ];
    this.rawKeys.add(keyDigest);
    const existing = this.rows.get(keyDigest);
    const shouldReset =
      existing === undefined || existing.windowStartedAt <= cutoff;
    const next: RateLimitRow = {
      keyDigest,
      windowStartedAt: shouldReset ? now : existing.windowStartedAt,
      attemptCount: shouldReset ? 1 : existing.attemptCount + 1,
      updatedAt,
    };
    this.rows.set(keyDigest, next);
    return {
      windowStartedAt: next.windowStartedAt,
      attemptCount: next.attemptCount,
    };
  }

  run(sql: string, params: readonly unknown[]): void {
    if (sql.includes("DELETE FROM login_rate_limits WHERE updated_at <= ?")) {
      const [cutoff] = params as [string];
      for (const [keyDigest, row] of this.rows) {
        if (row.updatedAt <= cutoff) this.rows.delete(keyDigest);
      }
      return;
    }
    if (sql.includes("DELETE FROM login_rate_limits WHERE key_digest = ?")) {
      const [keyDigest] = params as [string];
      this.rows.delete(keyDigest);
      return;
    }
    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }
}

describe("D1LoginRateLimiter", () => {
  it("shares a bounded fixed window without persisting the raw client key", async () => {
    const binding = new FakeD1Binding();
    const limiter = new D1LoginRateLimiter(binding, {
      maxAttempts: 2,
      windowMs: 60_000,
    });
    const clientKey = "cf:203.0.113.40";
    const startedAt = new Date("2026-08-07T21:00:00.000Z");

    await expect(limiter.consume(clientKey, startedAt)).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    await expect(
      limiter.consume(clientKey, new Date("2026-08-07T21:00:10.000Z")),
    ).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    await expect(
      limiter.consume(clientKey, new Date("2026-08-07T21:00:20.000Z")),
    ).resolves.toEqual({ allowed: false, retryAfterMs: 40_000 });

    expect(binding.rows).toHaveLength(1);
    expect(binding.rawKeys).not.toContain(clientKey);
    expect([...binding.rawKeys][0]).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("starts a new window after expiry and removes state on reset", async () => {
    const binding = new FakeD1Binding();
    const limiter = new D1LoginRateLimiter(binding, {
      maxAttempts: 1,
      windowMs: 1_000,
    });
    const key = "xff:127.0.0.1";

    await limiter.consume(key, new Date("2026-08-07T21:00:00.000Z"));
    await expect(
      limiter.consume(key, new Date("2026-08-07T21:00:00.500Z")),
    ).resolves.toEqual({ allowed: false, retryAfterMs: 500 });
    await expect(
      limiter.consume(key, new Date("2026-08-07T21:00:01.000Z")),
    ).resolves.toEqual({ allowed: true, retryAfterMs: 0 });

    expect(binding.rows).toHaveLength(1);
    await limiter.reset(key);
    expect(binding.rows).toHaveLength(0);
  });

  it("prunes expired client rows while consuming a current attempt", async () => {
    const binding = new FakeD1Binding();
    binding.rows.set("stale-digest", {
      keyDigest: "stale-digest",
      windowStartedAt: "2026-08-07T20:00:00.000Z",
      attemptCount: 4,
      updatedAt: "2026-08-07T20:00:30.000Z",
    });
    binding.rows.set("recent-digest", {
      keyDigest: "recent-digest",
      windowStartedAt: "2026-08-07T20:59:30.000Z",
      attemptCount: 1,
      updatedAt: "2026-08-07T20:59:45.000Z",
    });
    const limiter = new D1LoginRateLimiter(binding, {
      maxAttempts: 5,
      windowMs: 60_000,
    });

    await limiter.consume(
      "cf:203.0.113.70",
      new Date("2026-08-07T21:00:00.000Z"),
    );

    expect(binding.rows.has("stale-digest")).toBe(false);
    expect(binding.rows.has("recent-digest")).toBe(true);
    expect(binding.rows).toHaveLength(2);
  });
});
