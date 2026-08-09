import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  SessionHandoffService,
  type RecordedDevelopmentSession,
  type SessionHandoffAuditEvent,
  type SessionHandoffRepository,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "h".repeat(32);
const owner = {
  id: "semogtw-owner",
  sessionId: "owner-session-handoff-1",
  expiresAt: "2026-08-20T00:00:00.000Z",
};

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (rawToken) =>
    rawToken === "raw-handoff-session" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const insertSessionWithAudit = vi.fn(
  async (
    _session: RecordedDevelopmentSession,
    _audit: SessionHandoffAuditEvent,
  ) => undefined,
);
const repository: SessionHandoffRepository = { insertSessionWithAudit };

function app() {
  return createApiApp({
    auth: {
      provider: authProvider,
      sessionSecret,
      nodeEnv: "test",
    },
    privateSessionHandoffs: new SessionHandoffService(repository),
  });
}

async function authenticatedHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=raw-handoff-session; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    ...extra,
  };
}

const validBody = {
  projectId: "project-1",
  title: "Cloudflare private writes",
  branch: " main ",
  commits: ["ABCDEF1", "abcdef1", "1234567"],
  completedSummary: "Portamos mais uma mutação append-only.",
  testsStatus: "passed",
  testsSummary: "CI centralizado verde.",
  blockers: "Lifecycle concorrente permanece no Node.",
  nextStep: "Continuar a paridade segura.",
  result: "significant",
  reason: "Registrar handoff verificável.",
  confirmed: true,
} as const;

beforeEach(() => {
  insertSessionWithAudit.mockClear();
  vi.mocked(authProvider.resolveSession).mockClear();
});

describe("private session handoff mutation", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/session-handoffs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request("/api/v1/private/session-handoffs", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=raw-handoff-session`,
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    expect(noCsrf.status).toBe(403);
    expect(insertSessionWithAudit).not.toHaveBeenCalled();
  });

  it("uses server-owned metadata and domain-normalized commits", async () => {
    const correlationId = "handoff-request-0001";
    const response = await app().request("/api/v1/private/session-handoffs", {
      method: "POST",
      headers: await authenticatedHeaders({ "x-correlation-id": correlationId }),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      ok: true,
      data: { sessionId: expect.any(String) },
    });
    expect(insertSessionWithAudit).toHaveBeenCalledTimes(1);

    const [session, audit] = insertSessionWithAudit.mock.calls[0] ?? [];
    expect(session).toMatchObject({
      projectId: "project-1",
      actor: owner.id,
      branch: "main",
      commits: ["abcdef1", "1234567"],
      source: "manual",
      automatic: false,
      sourceHash: null,
    });
    expect(session?.sessionDate).toBe(session?.createdAt);
    expect(Date.parse(session?.sessionDate ?? "")).not.toBeNaN();
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "development_session.create",
      entityType: "development_session",
      confirmed: true,
      correlationId,
    });
    expect(audit?.entityId).toBe(session?.id);
  });

  it("keeps commit and confirmation validation in the domain", async () => {
    const invalidCommit = await app().request(
      "/api/v1/private/session-handoffs",
      {
        method: "POST",
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ ...validBody, commits: ["not-a-sha"] }),
      },
    );
    expect(invalidCommit.status).toBe(400);
    await expect(invalidCommit.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["COMMIT_INVALID"] },
    });

    const unconfirmed = await app().request(
      "/api/v1/private/session-handoffs",
      {
        method: "POST",
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ ...validBody, confirmed: false }),
      },
    );
    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        details: ["CONFIRMATION_REQUIRED"],
      },
    });
    expect(insertSessionWithAudit).not.toHaveBeenCalled();
  });

  it("bounds handoff request bodies before executing the command", async () => {
    const response = await app().request("/api/v1/private/session-handoffs", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({
        ...validBody,
        completedSummary: "x".repeat(33 * 1024),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(insertSessionWithAudit).not.toHaveBeenCalled();
  });

  it("sanitizes repository failures", async () => {
    insertSessionWithAudit.mockRejectedValueOnce(
      new Error("PRIVATE_D1_SESSION_CONSTRAINT"),
    );
    const response = await app().request("/api/v1/private/session-handoffs", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).not.toContain("PRIVATE_D1_SESSION_CONSTRAINT");
  });
});
