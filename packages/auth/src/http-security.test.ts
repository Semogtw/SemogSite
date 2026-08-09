import { describe, expect, it } from "vitest";
import {
  SlidingWindowRateLimiter,
  csrfCookieOptions,
  issueCsrfToken,
  sessionCookieOptions,
  verifyCsrfToken,
} from "./http-security";

describe("HTTP authentication security", () => {
  it("requires a matching session-bound CSRF token", async () => {
    const token = await issueCsrfToken("s".repeat(32), "session-1");

    await expect(
      verifyCsrfToken("s".repeat(32), "session-1", token, token),
    ).resolves.toBe(true);
    await expect(
      verifyCsrfToken("s".repeat(32), "session-2", token, token),
    ).resolves.toBe(false);
    await expect(
      verifyCsrfToken("s".repeat(32), "session-1", token, "different"),
    ).resolves.toBe(false);
  });

  it("locks a key after the configured number of attempts", () => {
    const limiter = new SlidingWindowRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const now = new Date("2026-08-01T00:00:00.000Z");

    expect(limiter.consume("client", now)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.consume("client", now)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.consume("client", now)).toEqual({ allowed: false, retryAfterMs: 60_000 });
  });

  it("uses secure production cookies with a fourteen-day absolute max age", () => {
    expect(sessionCookieOptions("production")).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    expect(csrfCookieOptions("production")).toEqual({
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  });
});
