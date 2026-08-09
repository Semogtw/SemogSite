import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-registry-order-secret-123456";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-registry-order-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-registry-order-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
  });
}

describe("private mutation registry middleware ordering", () => {
  it("does not reveal registry state before owner authentication", async () => {
    const response = await app().request("/api/v1/private/not-registered", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });

    expect(response.status).toBe(401);
  });

  it("does not reveal registry state before CSRF validation", async () => {
    const response = await app().request("/api/v1/private/not-registered", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=private-registry-order-token`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmed: true }),
    });

    expect(response.status).toBe(403);
  });

  it("fails closed on the registry only after auth and CSRF succeed", async () => {
    const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
    const response = await app().request("/api/v1/private/not-registered", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=private-registry-order-token; ${CSRF_COOKIE_NAME}=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmed: true }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PRIVATE_MUTATION_NOT_REGISTERED" },
    });
  });
});
