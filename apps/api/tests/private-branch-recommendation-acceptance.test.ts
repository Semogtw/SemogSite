import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  BranchRecommendationAcceptanceService,
  type BranchRecommendationAcceptanceRepository,
  type RepositoryBranchCandidate,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "branch-recommendation-secret-123456";
const owner = {
  id: "semogtw-owner",
  sessionId: "branch-recommendation-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "branch-recommendation-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const candidate: RepositoryBranchCandidate = {
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    activeBranch: "main",
    defaultBranch: "main",
    updatedAt: "2026-08-09T03:00:00.000Z",
  },
  recommendation: {
    id: "recommendation-2",
    status: "recommended",
    branch: "develop/cloudflare",
    confidence: "high",
    observedAt: "2026-08-09T03:30:00.000Z",
  },
};
const findCandidate = vi.fn<BranchRecommendationAcceptanceRepository["findCandidate"]>();
const acceptWithAudit = vi.fn<BranchRecommendationAcceptanceRepository["acceptWithAudit"]>();
const repository: BranchRecommendationAcceptanceRepository = {
  findCandidate,
  acceptWithAudit,
};

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateBranchRecommendations: new BranchRecommendationAcceptanceService(repository),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=branch-recommendation-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    "x-correlation-id": "branch-recommendation-correlation",
  };
}

const body = {
  repositoryId: candidate.repository.id,
  recommendationId: candidate.recommendation!.id,
  expectedActiveBranch: "main",
  reason: "Aceitar observação atual.",
  confirmed: true,
};

beforeEach(() => {
  findCandidate.mockReset();
  findCandidate.mockResolvedValue(candidate);
  acceptWithAudit.mockReset();
  acceptWithAudit.mockResolvedValue(true);
});

describe("private branch recommendation acceptance", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/branch-recommendations/accept",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/branch-recommendations/accept",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=branch-recommendation-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(acceptWithAudit).not.toHaveBeenCalled();
  });

  it("persists only the observed recommendation with server-owned audit metadata", async () => {
    const response = await app().request(
      "/api/v1/private/branch-recommendations/accept",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        repositoryId: candidate.repository.id,
        activeBranch: "develop/cloudflare",
        recommendationId: candidate.recommendation?.id,
      },
    });
    const [, after, audit] = acceptWithAudit.mock.calls[0] ?? [];
    expect(after?.repository).toMatchObject({ activeBranch: "develop/cloudflare" });
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "repository.active_branch.accept",
      reason: body.reason,
      correlationId: "branch-recommendation-correlation",
      confirmed: true,
    });
  });

  it("rejects stale recommendations before persistence and CAS loss as conflict", async () => {
    const stale = await app().request(
      "/api/v1/private/branch-recommendations/accept",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ ...body, recommendationId: "recommendation-old" }),
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_RECOMMENDATION" },
    });
    expect(acceptWithAudit).not.toHaveBeenCalled();

    acceptWithAudit.mockResolvedValueOnce(false);
    const conflict = await app().request(
      "/api/v1/private/branch-recommendations/accept",
      { method: "POST", headers: await headers(), body: JSON.stringify(body) },
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });
});
