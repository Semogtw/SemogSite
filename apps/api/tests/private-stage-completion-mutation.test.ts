import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  StageCompletionService,
  type StageCompletionRepository,
  type StageSnapshot,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "stage-test-secret-stage-test-secret";
const owner = {
  id: "semogtw-owner",
  sessionId: "stage-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "stage-session-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const stage: StageSnapshot = {
  id: "stage-1",
  projectId: "project-1",
  title: "Cloudflare production",
  state: "in_progress",
  progress: 90,
  done: false,
  nextStep: "Validar deploy.",
  blocker: null,
  evidence: [{ id: "evidence-1", status: "passed" }],
  manualLock: false,
  updatedAt: "2026-08-09T03:00:00.000Z",
};

const findById = vi.fn<StageCompletionRepository["findById"]>();
const completeWithAudit = vi.fn<StageCompletionRepository["completeWithAudit"]>();
const repository: StageCompletionRepository = { findById, completeWithAudit };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateStages: new StageCompletionService(repository),
  });
}

async function headers(extra: Record<string, string> = {}) {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=stage-session-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    ...extra,
  };
}

const body = {
  stageId: " stage-1 ",
  reason: " Gate validado. ",
  confirmed: true,
};

beforeEach(() => {
  findById.mockReset();
  findById.mockResolvedValue(stage);
  completeWithAudit.mockReset();
  completeWithAudit.mockResolvedValue(true);
});

describe("private stage completion mutation", () => {
  it("requires owner auth and CSRF", async () => {
    const unauthorized = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=stage-session-token`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(noCsrf.status).toBe(403);
    expect(completeWithAudit).not.toHaveBeenCalled();
  });

  it("normalizes through the domain and keeps audit metadata server-owned", async () => {
    const response = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: await headers({ "x-correlation-id": "stage-correlation" }),
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { stageId: "stage-1" },
    });
    expect(findById).toHaveBeenCalledWith("stage-1");
    const [, after, audit] = completeWithAudit.mock.calls[0] ?? [];
    expect(after).toMatchObject({
      state: "completed",
      progress: 100,
      done: true,
      nextStep: null,
      manualLock: true,
    });
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "stage.complete",
      reason: "Gate validado.",
      correlationId: "stage-correlation",
      confirmed: true,
    });
  });

  it("returns invariant and optimistic conflicts without false success", async () => {
    findById.mockResolvedValueOnce({ ...stage, evidence: [] });
    const invalid = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify(body),
    });
    expect(invalid.status).toBe(409);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVARIANT_FAILED", details: ["EVIDENCE_REQUIRED"] },
    });

    completeWithAudit.mockResolvedValueOnce(false);
    const conflict = await app().request("/api/v1/private/stages/complete", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify(body),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });
});
