import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  RepositoryTargetRegistrationService,
  type RepositorySyncTargetRegistrationRepository,
  type RegisteredRepositorySyncTarget,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "repository-registration-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "repository-registration-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "repository-registration-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const createWithAudit = vi.fn<
  RepositorySyncTargetRegistrationRepository["createWithAudit"]
>();
const repository: RepositorySyncTargetRegistrationRepository = { createWithAudit };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateRepositoryTargetRegistration: new RepositoryTargetRegistrationService(
      repository,
    ),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=repository-registration-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    "x-correlation-id": "repository-registration-correlation",
  };
}

const body = {
  projectId: " project-1 ",
  fullName: " Semogtw/SemogSite ",
  defaultBranch: " main ",
  role: "product" as const,
  reason: " Cadastrar alvo privado. ",
  confirmed: true,
};

beforeEach(() => {
  createWithAudit.mockReset();
  createWithAudit.mockResolvedValue("created");
});

describe("private repository target registration mutation", () => {
  it("requires owner auth and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/repository-targets/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/repository-targets/register",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=repository-registration-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(createWithAudit).not.toHaveBeenCalled();
  });

  it("normalizes target identity and owns audit identifiers on the server", async () => {
    const response = await app().request(
      "/api/v1/private/repository-targets/register",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: {
        fullName: "Semogtw/SemogSite",
        projectId: "project-1",
        role: "product",
      },
    });

    const [target, audit] = createWithAudit.mock.calls[0] ?? [];
    expect(target).toMatchObject({
      projectId: "project-1",
      owner: "Semogtw",
      name: "SemogSite",
      fullName: "Semogtw/SemogSite",
      defaultBranch: "main",
      syncEnabled: true,
      status: "active",
      dataSource: "manual",
    } satisfies Partial<RegisteredRepositorySyncTarget>);
    expect(target?.id).toMatch(/^repository-/u);
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "repository.sync_target.create",
      reason: "Cadastrar alvo privado.",
      correlationId: "repository-registration-correlation",
      confirmed: true,
    });
  });

  it("maps project and uniqueness outcomes without leaking storage details", async () => {
    createWithAudit.mockResolvedValueOnce("project_not_found");
    const missing = await app().request(
      "/api/v1/private/repository-targets/register",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });

    createWithAudit.mockResolvedValueOnce("duplicate");
    const duplicate = await app().request(
      "/api/v1/private/repository-targets/register",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE_REPOSITORY" },
    });
  });
});
