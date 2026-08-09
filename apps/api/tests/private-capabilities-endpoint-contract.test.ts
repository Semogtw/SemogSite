import {
  SESSION_COOKIE_NAME,
  type AuthProvider,
} from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import { createPrivateRuntimeCapabilities } from "../src/private-capabilities";

const owner = {
  id: "semogtw-owner",
  sessionId: "capability-contract-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "capability-contract-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

function app() {
  return createApiApp({
    authProvider,
    privateCapabilities: {
      getCapabilities: () =>
        createPrivateRuntimeCapabilities("cloudflare-worker-d1"),
    },
  });
}

describe("private capability endpoint mutation contracts", () => {
  it("returns method, path, external-effect and retry semantics per write", async () => {
    const response = await app().request("/api/v1/private/capabilities", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=capability-contract-token`,
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    const endpoints = new Map(
      payload.data.stateWriteEndpoints.map(
        (item: {
          name: string;
          method: string;
          path: string;
          externalEffect: boolean;
          retrySemantics: string;
        }) => [item.name, item],
      ),
    );

    expect(endpoints.get("stage.complete")).toMatchObject({
      method: "POST",
      path: "/api/v1/private/stages/complete",
      externalEffect: false,
      retrySemantics: "optimistic-concurrency",
    });
    expect(endpoints.get("cooperative_run.transition")).toMatchObject({
      method: "POST",
      path: "/api/v1/private/cooperative-runs/transition",
      externalEffect: false,
      retrySemantics: "semantic-idempotency",
    });
    expect(endpoints.get("repository.sync_target.register")).toMatchObject({
      method: "POST",
      path: "/api/v1/private/repository-targets/register",
      externalEffect: false,
      retrySemantics: "deduplicated-state",
    });
    expect(endpoints.get("attention.capture")).toMatchObject({
      method: "POST",
      path: "/api/v1/private/attention",
      externalEffect: false,
      retrySemantics: "atomic-create",
    });
  });
});
