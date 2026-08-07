import type { RateLimiterOptions } from "@semogtw/auth";
import type { D1DatabaseBinding } from "../adapters/d1";

type RateLimitRow = {
  readonly windowStartedAt: string;
  readonly attemptCount: number;
};

export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
};

function isRateLimitRow(value: unknown): value is RateLimitRow {
  if (value === null || typeof value !== "object") return false;
  const row = value as Partial<RateLimitRow>;
  return (
    typeof row.windowStartedAt === "string" &&
    typeof row.attemptCount === "number"
  );
}

async function digestClientKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export class D1LoginRateLimiter {
  readonly #database: D1DatabaseBinding;
  readonly #options: RateLimiterOptions;

  constructor(database: D1DatabaseBinding, options: RateLimiterOptions) {
    this.#database = database;
    this.#options = options;
    if (options.maxAttempts < 1 || options.windowMs < 1) {
      throw new Error("INVALID_RATE_LIMIT_CONFIGURATION");
    }
  }

  async consume(key: string, now = new Date()): Promise<RateLimitDecision> {
    const keyDigest = await digestClientKey(key);
    const timestamp = now.getTime();
    const nowIso = now.toISOString();
    const cutoffIso = new Date(timestamp - this.#options.windowMs).toISOString();

    const row = await this.#database
      .prepare(
        `INSERT INTO login_rate_limits (
           key_digest,
           window_started_at,
           attempt_count,
           updated_at
         ) VALUES (?, ?, 1, ?)
         ON CONFLICT(key_digest) DO UPDATE SET
           window_started_at = CASE
             WHEN login_rate_limits.window_started_at <= ?
               THEN excluded.window_started_at
             ELSE login_rate_limits.window_started_at
           END,
           attempt_count = CASE
             WHEN login_rate_limits.window_started_at <= ?
               THEN 1
             ELSE login_rate_limits.attempt_count + 1
           END,
           updated_at = excluded.updated_at
         RETURNING
           window_started_at AS windowStartedAt,
           attempt_count AS attemptCount`,
      )
      .bind(keyDigest, nowIso, nowIso, cutoffIso, cutoffIso)
      .first<RateLimitRow>();

    if (!isRateLimitRow(row)) {
      throw new Error("D1_LOGIN_RATE_LIMIT_UPDATE_FAILED");
    }

    if (row.attemptCount <= this.#options.maxAttempts) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const windowStartedAt = Date.parse(row.windowStartedAt);
    const retryAfterMs = Number.isFinite(windowStartedAt)
      ? Math.max(1, windowStartedAt + this.#options.windowMs - timestamp)
      : this.#options.windowMs;

    return { allowed: false, retryAfterMs };
  }

  async reset(key: string): Promise<void> {
    const keyDigest = await digestClientKey(key);
    const result = await this.#database
      .prepare(`DELETE FROM login_rate_limits WHERE key_digest = ?`)
      .bind(keyDigest)
      .run();

    if (result.success === false) {
      throw new Error("D1_LOGIN_RATE_LIMIT_RESET_FAILED");
    }
  }
}
