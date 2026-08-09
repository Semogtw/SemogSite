import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-registry-path-secret-123456";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-registry-path-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-registry-path-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=private-registry-path-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

describe("private mutation registry path normalization", () => {
  it("treats a single trailing slash as the registered canonical path", async () => {
    const response = await createApiApp({
      auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    }).request("/api/v1/private/stages/complete/", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("x-semogtw-operation")).toBe("stage.complete");
    expect(response.headers.get("x-semogtw-retry-semantics")).toBe(
      "optimistic-concurrency",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MUTATION_UNAVAILABLE" },
    });
  });
});
