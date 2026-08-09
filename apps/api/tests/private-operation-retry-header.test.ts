import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-retry-header-secret-123456";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-retry-header-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-retry-header-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=private-retry-header-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
  });
}

describe("private operation retry headers", () => {
  it("labels optimistic-concurrency writes", async () => {
    const response = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    });

    expect(response.headers.get("x-semogtw-operation")).toBe("stage.complete");
    expect(response.headers.get("x-semogtw-retry-semantics")).toBe(
      "optimistic-concurrency",
    );
  });

  it("labels semantic-idempotency writes before route validation", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("x-semogtw-operation")).toBe(
      "cooperative_run.transition",
    );
    expect(response.headers.get("x-semogtw-retry-semantics")).toBe(
      "semantic-idempotency",
    );
  });
});
