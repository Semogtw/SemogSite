import {
  CSRF_COOKIE_NAME,
  issueCsrfToken,
  SESSION_COOKIE_NAME,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "s".repeat(32);

function provider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    authenticate: vi.fn(async () => ({
      ok: true as const,
      rawToken: "raw-session-token",
      session: {
        id: "session-1",
        expiresAt: "2026-08-19T12:00:00.000Z",
      },
    })),
    resolveSession: vi.fn(async () => ({
      id: "semogtw-owner",
      sessionId: "session-1",
      expiresAt: "2026-08-19T12:00:00.000Z",
    })),
    revokeSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

function setCookies(response: Response): readonly string[] {
  return response.headers.getSetCookie();
}

describe("API authentication session routes", () => {
  it("issues secure session and readable CSRF cookies without returning the raw token", async () => {
    const authProvider = provider();
    const app = createApiApp({
      auth: {
        provider: authProvider,
        sessionSecret,
        nodeEnv: "production",
      },
    });

    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify({ password: "correct horse battery staple" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const cookies = setCookies(response);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain(`${SESSION_COOKIE_NAME}=raw-session-token`);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("Secure");
    expect(cookies[0]).toContain("SameSite=Lax");
    expect(cookies[1]).toContain(`${CSRF_COOKIE_NAME}=`);
    expect(cookies[1]).not.toContain("HttpOnly");
    expect(cookies[1]).toContain("Secure");

    const text = await response.text();
    expect(text).not.toContain("raw-session-token");
    expect(JSON.parse(text)).toEqual({
      ok: true,
      data: { expiresAt: "2026-08-19T12:00:00.000Z" },
    });
    expect(authProvider.authenticate).toHaveBeenCalledWith({
      password: "correct horse battery staple",
    });
  });

  it("fails closed with generic errors for absent auth, invalid input and credentials", async () => {
    const unconfigured = createApiApp();
    const unconfiguredResponse = await unconfigured.request(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      },
    );
    expect(unconfiguredResponse.status).toBe(401);

    const authProvider = provider({
      authenticate: vi.fn(async () => ({
        ok: false as const,
        reason: "INVALID_CREDENTIALS" as const,
      })),
    });
    const app = createApiApp({
      auth: {
        provider: authProvider,
        sessionSecret,
        nodeEnv: "test",
      },
    });

    const invalidBody = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    expect(invalidBody.status).toBe(400);

    const invalidCredentials = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(invalidCredentials.status).toBe(401);
    await expect(invalidCredentials.json()).resolves.toMatchObject({
      error: { message: "Não foi possível autenticar." },
    });
    expect(setCookies(invalidCredentials)).toHaveLength(0);
  });

  it("returns session state without exposing the session identifier", async () => {
    const app = createApiApp({
      auth: {
        provider: provider(),
        sessionSecret,
        nodeEnv: "test",
      },
    });

    const response = await app.request("/api/v1/auth/session", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=raw-session-token` },
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("session-1");
    expect(JSON.parse(text)).toEqual({
      ok: true,
      data: {
        authenticated: true,
        owner: {
          id: "semogtw-owner",
          expiresAt: "2026-08-19T12:00:00.000Z",
        },
      },
    });
  });

  it("requires session-bound CSRF before revoking a live session", async () => {
    const authProvider = provider();
    const app = createApiApp({
      auth: {
        provider: authProvider,
        sessionSecret,
        nodeEnv: "production",
      },
    });
    const csrf = await issueCsrfToken(sessionSecret, "session-1");
    const cookie = [
      `${SESSION_COOKIE_NAME}=raw-session-token`,
      `${CSRF_COOKIE_NAME}=${csrf}`,
    ].join("; ");

    const rejected = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie, "x-csrf-token": "wrong" },
    });
    expect(rejected.status).toBe(403);
    expect(authProvider.revokeSession).not.toHaveBeenCalled();
    expect(setCookies(rejected)).toHaveLength(0);

    const accepted = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(accepted.status).toBe(200);
    expect(authProvider.revokeSession).toHaveBeenCalledWith("session-1");
    expect(setCookies(accepted)).toHaveLength(2);
    for (const cleared of setCookies(accepted)) {
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("Secure");
    }
    await expect(accepted.json()).resolves.toEqual({
      ok: true,
      data: { revoked: true },
    });
  });

  it("clears stale cookies idempotently and rate-limits before password verification", async () => {
    const authProvider = provider({
      resolveSession: vi.fn(async () => null),
    });
    const loginLimiter = {
      consume: vi.fn(() => ({ allowed: false, retryAfterMs: 61_000 })),
      reset: vi.fn(),
    };
    const app = createApiApp({
      auth: {
        provider: authProvider,
        sessionSecret,
        nodeEnv: "test",
        loginLimiter,
      },
    });

    const limited = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "not-checked" }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("61");
    expect(authProvider.authenticate).not.toHaveBeenCalled();

    const staleLogout = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=stale; ${CSRF_COOKIE_NAME}=stale`,
      },
    });
    expect(staleLogout.status).toBe(200);
    expect(authProvider.revokeSession).not.toHaveBeenCalled();
    await expect(staleLogout.json()).resolves.toEqual({
      ok: true,
      data: { revoked: false },
    });
    expect(setCookies(staleLogout)).toHaveLength(2);
  });
});
