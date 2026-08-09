import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "private-operation-registry-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "private-operation-registry-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "private-operation-registry-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

async function privateHeaders() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=private-operation-registry-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCapabilities: {
      getCapabilities: () => ({
        runtime: "cloudflare-worker-d1" as const,
        canonicalStorage: "d1" as const,
        stateWrites: [],
        stateWriteEndpoints: [],
        externalEffects: {
          repositoryCheckout: false as const,
          repositoryFetch: false as const,
          repositoryPush: false as const,
          commandExecution: false as const,
          processControl: false as const,
        },
        semantics: {
          ownerSessionRequired: true as const,
          sameOriginRequired: true as const,
          csrfRequiredForMutations: true as const,
          auditLedger: true as const,
          optimisticConcurrency: true as const,
          semanticIdempotency: true as const,
        },
      }),
    },
  });
}

describe("private operation registry middleware", () => {
  it("fails closed for an authenticated private POST absent from the registry", async () => {
    const response = await app().request("/api/v1/private/unknown-write", {
      method: "POST",
      headers: await privateHeaders(),
      body: JSON.stringify({ confirmed: true }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PRIVATE_MUTATION_NOT_REGISTERED" },
    });
  });

  it("does not turn private reads into registered mutations", async () => {
    const response = await app().request("/api/v1/private/capabilities", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=private-operation-registry-token`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-semogtw-operation")).toBeNull();
  });

  it("labels a registered mutation before its route handles the request", async () => {
    const response = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: await privateHeaders(),
      body: JSON.stringify({
        stageId: "stage-1",
        reason: "Gate validado.",
        confirmed: true,
      }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("x-semogtw-operation")).toBe("stage.complete");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MUTATION_UNAVAILABLE" },
    });
  });
});
