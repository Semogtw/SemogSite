import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  AttentionLifecycleService,
  type AttentionLifecycleRepository,
  type AttentionLifecycleSnapshot,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "attention-lifecycle-secret-123456";
const owner = {
  id: "semogtw-owner",
  sessionId: "attention-lifecycle-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "attention-lifecycle-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const item: AttentionLifecycleSnapshot = {
  id: "attention-1",
  projectId: null,
  type: "risk",
  status: "open",
  impact: "high",
  title: "Validar produção",
  owner: "owner",
  nextAction: "Executar gate.",
  source: "manual",
  resolvedAt: null,
  createdAt: "2026-08-09T03:00:00.000Z",
  updatedAt: "2026-08-09T03:00:00.000Z",
};
const findById = vi.fn<AttentionLifecycleRepository["findById"]>();
const transitionWithAudit = vi.fn<
  AttentionLifecycleRepository["transitionWithAudit"]
>();
const repository: AttentionLifecycleRepository = { findById, transitionWithAudit };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateAttentionLifecycle: new AttentionLifecycleService(repository),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=attention-lifecycle-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    "x-correlation-id": "attention-lifecycle-correlation",
  };
}

beforeEach(() => {
  findById.mockReset();
  findById.mockResolvedValue(item);
  transitionWithAudit.mockReset();
  transitionWithAudit.mockResolvedValue(true);
});

describe("private attention lifecycle mutation", () => {
  it("requires authentication and CSRF", async () => {
    const unauthorized = await app().request("/api/v1/private/attention/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attentionId: item.id,
        targetStatus: "resolved",
        reason: "Resolvido.",
        confirmed: true,
      }),
    });
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request("/api/v1/private/attention/transition", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=attention-lifecycle-token`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        attentionId: item.id,
        targetStatus: "resolved",
        reason: "Resolvido.",
        confirmed: true,
      }),
    });
    expect(noCsrf.status).toBe(403);
    expect(transitionWithAudit).not.toHaveBeenCalled();
  });

  it("records a server-owned audited final transition", async () => {
    const response = await app().request("/api/v1/private/attention/transition", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        attentionId: " attention-1 ",
        targetStatus: "dismissed",
        reason: " Não é mais relevante. ",
        confirmed: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { attentionId: item.id, status: "dismissed" },
    });
    expect(findById).toHaveBeenCalledWith(item.id);
    const [, after, audit] = transitionWithAudit.mock.calls[0] ?? [];
    expect(after).toMatchObject({ status: "dismissed" });
    expect(Date.parse(after?.resolvedAt ?? "")).not.toBeNaN();
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "attention.dismiss",
      reason: "Não é mais relevante.",
      correlationId: "attention-lifecycle-correlation",
      confirmed: true,
    });
  });

  it("maps final-state and optimistic conflicts to 409", async () => {
    findById.mockResolvedValueOnce({ ...item, status: "resolved" });
    const final = await app().request("/api/v1/private/attention/transition", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        attentionId: item.id,
        targetStatus: "dismissed",
        reason: "Tentar novamente.",
        confirmed: true,
      }),
    });
    expect(final.status).toBe(409);
    await expect(final.json()).resolves.toMatchObject({
      error: { code: "ALREADY_FINAL" },
    });

    transitionWithAudit.mockResolvedValueOnce(false);
    const conflict = await app().request("/api/v1/private/attention/transition", {
      method: "POST",
      headers: await headers(),
      body: JSON.stringify({
        attentionId: item.id,
        targetStatus: "resolved",
        reason: "Resolvido.",
        confirmed: true,
      }),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });
});
