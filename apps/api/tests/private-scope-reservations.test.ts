import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import type { ScopeReservationSnapshot } from "@semogtw/domain/orchestration";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateScopeReservationCommands } from "../src/routes/private/scope-reservations";

const sessionSecret = "scope-reservation-secret-123456789";
const owner = {
  id: "semogtw-owner",
  sessionId: "scope-reservation-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "scope-reservation-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const reservation: ScopeReservationSnapshot = {
  id: "scope-reservation-stable",
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "cooperative-run-1",
  branch: "main",
  kind: "directory",
  patterns: ["apps/api/**"],
  holderLabel: "ChatGPT",
  purpose: "Portar writes D1.",
  state: "active",
  acquiredAt: "2026-08-09T20:00:00.000Z",
  renewedAt: "2026-08-09T20:00:00.000Z",
  expiresAt: "2026-08-09T20:30:00.000Z",
  releasedAt: null,
  version: 1,
};
const success = (snapshot: ScopeReservationSnapshot = reservation) => ({
  ok: true as const,
  reservation: snapshot,
  overlaps: [] as string[],
  audit: {} as never,
});
const acquire = vi.fn<PrivateScopeReservationCommands["acquire"]>(async () => success());
const renew = vi.fn<PrivateScopeReservationCommands["renew"]>(async () =>
  success({
    ...reservation,
    renewedAt: "2026-08-09T20:10:00.000Z",
    expiresAt: "2026-08-09T20:40:00.000Z",
    version: 2,
  }),
);
const release = vi.fn<PrivateScopeReservationCommands["release"]>(async () =>
  success({
    ...reservation,
    state: "released" as const,
    releasedAt: "2026-08-09T20:10:00.000Z",
    version: 2,
  }),
);
const override = vi.fn<PrivateScopeReservationCommands["override"]>(async () =>
  success({
    ...reservation,
    state: "overridden" as const,
    releasedAt: "2026-08-09T20:10:00.000Z",
    version: 2,
  }),
);
const commands: PrivateScopeReservationCommands = { acquire, renew, release, override };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateScopeReservations: commands,
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=scope-reservation-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const stableKey = "311ac4ca-3b3e-479b-8586-71ecbb24bc63";
const acquireBody = {
  idempotencyKey: stableKey,
  projectId: reservation.projectId,
  repositoryId: reservation.repositoryId,
  runId: reservation.runId,
  branch: reservation.branch,
  kind: reservation.kind,
  patterns: reservation.patterns,
  holderLabel: reservation.holderLabel,
  purpose: reservation.purpose,
  ttlSeconds: 1800,
  acknowledgeOverlap: false,
  confirmed: true as const,
};

beforeEach(() => {
  acquire.mockClear();
  renew.mockClear();
  release.mockClear();
  override.mockClear();
});

describe("private scope reservations", () => {
  it("requires owner authentication and CSRF before acquiring", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/scope-reservations/acquire",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acquireBody),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/scope-reservations/acquire",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=scope-reservation-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(acquireBody),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("acquires with retry-stable server identities", async () => {
    const response = await app().request(
      "/api/v1/private/scope-reservations/acquire",
      { method: "POST", headers: await headers(), body: JSON.stringify(acquireBody) },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { reservation: { state: "active" }, overlaps: [] },
    });
    expect(acquire.mock.calls[0]?.[1]).toMatchObject({
      actorId: owner.id,
      reservationId: `scope-reservation-${stableKey}`,
      auditId: `audit-scope-reservation-${stableKey}`,
      idempotencyKey: `scope-reservation-acquire-${stableKey}`,
      correlationId: `correlation-scope-reservation-${stableKey}`,
    });
  });

  it("maps overlap conflict with the conflicting reservation ids", async () => {
    acquire.mockResolvedValueOnce({
      ok: false,
      code: "OVERLAP_CONFLICT",
      overlaps: ["scope-reservation-other"],
    } as never);
    const response = await app().request(
      "/api/v1/private/scope-reservations/acquire",
      { method: "POST", headers: await headers(), body: JSON.stringify(acquireBody) },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "OVERLAP_CONFLICT",
        overlaps: ["scope-reservation-other"],
      },
    });
  });

  it("routes renew and release with observed version and run ownership", async () => {
    const renewResponse = await app().request(
      "/api/v1/private/scope-reservations/renew",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          reservationId: reservation.id,
          runId: reservation.runId,
          expectedVersion: reservation.version,
          ttlSeconds: 1800,
          confirmed: true,
        }),
      },
    );
    expect(renewResponse.status).toBe(200);
    expect(renew.mock.calls[0]?.[1]).toMatchObject({
      auditId: `audit-scope-renew-${stableKey}`,
      idempotencyKey: `scope-reservation-renew-${stableKey}`,
    });

    const releaseResponse = await app().request(
      "/api/v1/private/scope-reservations/release",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          reservationId: reservation.id,
          runId: reservation.runId,
          expectedVersion: reservation.version,
          reason: "Trabalho concluído.",
          confirmed: true,
        }),
      },
    );
    expect(releaseResponse.status).toBe(200);
    expect(release.mock.calls[0]?.[1]).toMatchObject({
      auditId: `audit-scope-release-${stableKey}`,
      idempotencyKey: `scope-reservation-release-${stableKey}`,
    });
  });

  it("requires explicit confirmation for owner override and keeps stable audit metadata", async () => {
    const response = await app().request(
      "/api/v1/private/scope-reservations/override",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          reservationId: reservation.id,
          expectedVersion: reservation.version,
          reason: "Liberar escopo de um agente encerrado.",
          confirmed: true,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(override.mock.calls[0]?.[0]).toMatchObject({ confirmed: true });
    expect(override.mock.calls[0]?.[1]).toMatchObject({
      auditId: `audit-scope-override-${stableKey}`,
      idempotencyKey: `scope-reservation-override-${stableKey}`,
    });
  });

  it("maps missing, stale and ownership failures without false success", async () => {
    renew.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" } as never);
    const stale = await app().request(
      "/api/v1/private/scope-reservations/renew",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          reservationId: reservation.id,
          runId: reservation.runId,
          expectedVersion: 1,
          ttlSeconds: 1800,
          confirmed: true,
        }),
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "STALE_STATE" } });

    release.mockResolvedValueOnce({ ok: false, code: "NOT_OWNER" } as never);
    const notOwner = await app().request(
      "/api/v1/private/scope-reservations/release",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          reservationId: reservation.id,
          runId: reservation.runId,
          expectedVersion: 1,
          reason: "Tentar liberar.",
          confirmed: true,
        }),
      },
    );
    expect(notOwner.status).toBe(409);
    await expect(notOwner.json()).resolves.toMatchObject({ error: { code: "NOT_OWNER" } });
  });
});
