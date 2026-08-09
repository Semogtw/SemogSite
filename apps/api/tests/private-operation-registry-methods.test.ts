import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-registry-method-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-registry-method-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-registry-method-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=private-registry-method-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
  });
}

describe("private mutation registry HTTP methods", () => {
  it.each(["PUT", "PATCH", "DELETE"])(
    "fails closed for an unregistered %s",
    async (method) => {
      const response = await app().request("/api/v1/private/unregistered", {
        method,
        headers: await headers(),
        body: JSON.stringify({ confirmed: true }),
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "PRIVATE_MUTATION_NOT_REGISTERED" },
      });
    },
  );

  it("leaves safe private reads outside the mutation allowlist", async () => {
    const response = await app().request("/api/v1/private/unregistered", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=private-registry-method-token`,
      },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("x-semogtw-operation")).toBeNull();
  });
});
