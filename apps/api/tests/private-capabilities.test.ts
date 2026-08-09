import {
  SESSION_COOKIE_NAME,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import { createPrivateRuntimeCapabilities } from "../src/private-capabilities";

const owner = {
  id: "semogtw-owner",
  sessionId: "capabilities-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "capabilities-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

function app(runtime: "cloudflare-worker-d1" | "node-sqlite") {
  return createApiApp({
    authProvider,
    privateCapabilities: {
      getCapabilities: () => createPrivateRuntimeCapabilities(runtime),
    },
  });
}

describe("private runtime capabilities", () => {
  it("requires an owner session", async () => {
    const response = await app("cloudflare-worker-d1").request(
      "/api/v1/private/capabilities",
    );
    expect(response.status).toBe(401);
  });

  it("reports D1 state capabilities without claiming external effects", async () => {
    const response = await app("cloudflare-worker-d1").request(
      "/api/v1/private/capabilities",
      {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=capabilities-token`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runtime: "cloudflare-worker-d1",
        canonicalStorage: "d1",
        externalEffects: {
          repositoryCheckout: false,
          repositoryFetch: false,
          repositoryPush: false,
          commandExecution: false,
          processControl: false,
        },
        semantics: {
          ownerSessionRequired: true,
          sameOriginRequired: true,
          csrfRequiredForMutations: true,
          auditLedger: true,
          optimisticConcurrency: true,
          semanticIdempotency: true,
        },
      },
    });
  });

  it("distinguishes the SQLite composition without widening its API effects", async () => {
    const response = await app("node-sqlite").request(
      "/api/v1/private/capabilities",
      {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=capabilities-token`,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: {
        runtime: "node-sqlite",
        canonicalStorage: "sqlite",
        externalEffects: {
          commandExecution: false,
        },
      },
    });
    expect(payload.data.stateWrites).toContain("verification_obligation.result");
    expect(payload.data.stateWrites).toContain("scope_reservation.override");
    expect(payload.data.stateWrites).toContain("editorial_redirect.revoke");
  });
});
