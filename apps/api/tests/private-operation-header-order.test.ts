import {
  SESSION_COOKIE_NAME,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-operation-header-order-secret";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-operation-header-order-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-operation-header-order-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
  });
}

describe("private operation metadata ordering", () => {
  it("does not expose operation or retry metadata before authentication", async () => {
    const response = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("x-semogtw-operation")).toBeNull();
    expect(response.headers.get("x-semogtw-retry-semantics")).toBeNull();
  });

  it("does not expose operation or retry metadata before CSRF succeeds", async () => {
    const response = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=private-operation-header-order-token`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("x-semogtw-operation")).toBeNull();
    expect(response.headers.get("x-semogtw-retry-semantics")).toBeNull();
  });
});
