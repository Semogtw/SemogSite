import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateEditorialRedirectCommands } from "../src/routes/private/editorial-redirects";

const sessionSecret = "editorial-redirect-secret-123456789";
const owner = {
  id: "semogtw-owner",
  sessionId: "editorial-redirect-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "editorial-redirect-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const event = {
  id: "editorial-redirect-create-stable",
  sourceSlug: "old-project",
  kind: "project" as const,
  targetDocumentId: "document-1",
  sequence: 1,
  action: "created" as const,
  actor: owner.id,
  reason: "Preservar URL antiga.",
  occurredAt: "2026-08-09T20:40:00.000Z",
  idempotencyKey: "editorial-redirect-create-stable",
  correlationId: "correlation-editorial-redirect-create-stable",
};
const create = vi.fn<PrivateEditorialRedirectCommands["create"]>(async () => ({
  ok: true as const,
  event,
  duplicate: false,
}));
const revoke = vi.fn<PrivateEditorialRedirectCommands["revoke"]>(async () => ({
  ok: true as const,
  event: { ...event, id: "revoke", sequence: 2, action: "revoked" as const },
  duplicate: false,
}));
const commands: PrivateEditorialRedirectCommands = { create, revoke };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateEditorialRedirects: commands,
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=editorial-redirect-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const stableKey = "0db0a91e-ea2d-42a2-8af5-280a78ab9b41";
const body = {
  idempotencyKey: stableKey,
  sourceSlug: "old-project",
  kind: "project" as const,
  targetDocumentId: "document-1",
  reason: "Preservar URL antiga.",
  confirmed: true as const,
};

beforeEach(() => {
  create.mockClear();
  revoke.mockClear();
});

describe("private editorial redirects", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/editorial-redirects/create",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/editorial-redirects/create",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=editorial-redirect-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates with server-owned retry-stable event identity", async () => {
    const response = await app().request(
      "/api/v1/private/editorial-redirects/create",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { event: { action: "created" }, duplicate: false },
    });
    const [request, context] = create.mock.calls[0] ?? [];
    expect(request).toEqual({
      sourceSlug: body.sourceSlug,
      kind: body.kind,
      targetDocumentId: body.targetDocumentId,
      reason: body.reason,
      confirmed: true,
    });
    expect(context).toMatchObject({
      actorId: owner.id,
      eventId: `editorial-redirect-create-${stableKey}`,
      idempotencyKey: `editorial-redirect-create-${stableKey}`,
      correlationId: `correlation-editorial-redirect-create-${stableKey}`,
    });
  });

  it("revokes through the same domain contract", async () => {
    const response = await app().request(
      "/api/v1/private/editorial-redirects/revoke",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(response.status).toBe(200);
    expect(revoke.mock.calls[0]?.[1]).toMatchObject({
      eventId: `editorial-redirect-revoke-${stableKey}`,
      idempotencyKey: `editorial-redirect-revoke-${stableKey}`,
    });
  });

  it("maps target and concurrency failures without false success", async () => {
    create.mockResolvedValueOnce({ ok: false, code: "TARGET_NOT_PUBLISHED" } as never);
    const unpublished = await app().request(
      "/api/v1/private/editorial-redirects/create",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(unpublished.status).toBe(409);
    await expect(unpublished.json()).resolves.toMatchObject({
      error: { code: "TARGET_NOT_PUBLISHED" },
    });

    revoke.mockResolvedValueOnce({ ok: false, code: "REDIRECT_NOT_ACTIVE" } as never);
    const inactive = await app().request(
      "/api/v1/private/editorial-redirects/revoke",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(inactive.status).toBe(409);
    await expect(inactive.json()).resolves.toMatchObject({
      error: { code: "REDIRECT_NOT_ACTIVE" },
    });

    create.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED"],
    } as never);
    const invalid = await app().request(
      "/api/v1/private/editorial-redirects/create",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["CONFIRMATION_REQUIRED"] },
    });
  });
});
