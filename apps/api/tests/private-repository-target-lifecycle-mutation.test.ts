import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  RepositoryTargetLifecycleService,
  type RepositorySyncTargetLifecycleRepository,
  type RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "repository-target-secret-123456789";
const owner = {
  id: "semogtw-owner",
  sessionId: "repository-target-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "repository-target-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const target: RepositorySyncTargetLifecycleSnapshot = {
  id: "repository-1",
  fullName: "Semogtw/SemogSite",
  syncEnabled: true,
  updatedAt: "2026-08-09T03:00:00.000Z",
};
const findTarget = vi.fn<RepositorySyncTargetLifecycleRepository["findTarget"]>();
const changeWithAudit = vi.fn<
  RepositorySyncTargetLifecycleRepository["changeWithAudit"]
>();
const repository: RepositorySyncTargetLifecycleRepository = {
  findTarget,
  changeWithAudit,
};

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateRepositoryTargets: new RepositoryTargetLifecycleService(repository),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=repository-target-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    "x-correlation-id": "repository-target-correlation",
  };
}

const body = {
  repositoryId: target.id,
  desiredSyncEnabled: false,
  expectedSyncEnabled: true,
  expectedUpdatedAt: target.updatedAt,
  reason: "Pausar durante manutenção.",
  confirmed: true,
};

beforeEach(() => {
  findTarget.mockReset();
  findTarget.mockResolvedValue(target);
  changeWithAudit.mockReset();
  changeWithAudit.mockResolvedValue(true);
});

describe("private repository target lifecycle mutation", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/repository-targets/lifecycle",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/repository-targets/lifecycle",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=repository-target-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(changeWithAudit).not.toHaveBeenCalled();
  });

  it("changes only the observed target and emits server-owned audit metadata", async () => {
    const response = await app().request(
      "/api/v1/private/repository-targets/lifecycle",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: { repositoryId: target.id, syncEnabled: false },
    });
    const [, after, audit] = changeWithAudit.mock.calls[0] ?? [];
    expect(after).toMatchObject({ id: target.id, syncEnabled: false });
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "repository.sync_target.disable",
      correlationId: "repository-target-correlation",
      reason: body.reason,
      confirmed: true,
    });
  });

  it("rejects stale state before persistence and maps CAS loss to conflict", async () => {
    const stale = await app().request(
      "/api/v1/private/repository-targets/lifecycle",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          ...body,
          expectedUpdatedAt: "2026-08-08T00:00:00.000Z",
        }),
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_STATE" },
    });
    expect(changeWithAudit).not.toHaveBeenCalled();

    changeWithAudit.mockResolvedValueOnce(false);
    const conflict = await app().request(
      "/api/v1/private/repository-targets/lifecycle",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(body),
      },
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });
});
