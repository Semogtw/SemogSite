import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  EvidenceService,
  type EvidenceAuditEvent,
  type EvidenceWriteRepository,
  type RecordedEvidence,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "e".repeat(32);
const owner = {
  id: "semogtw-owner",
  sessionId: "session-evidence-1",
  expiresAt: "2026-08-20T00:00:00.000Z",
};

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (rawToken) =>
    rawToken === "raw-evidence-session" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const insertEvidenceWithAudit = vi.fn(
  async (_record: RecordedEvidence, _audit: EvidenceAuditEvent) => undefined,
);
const repository: EvidenceWriteRepository = { insertEvidenceWithAudit };

function app() {
  return createApiApp({
    auth: {
      provider: authProvider,
      sessionSecret,
      nodeEnv: "test",
    },
    privateEvidence: new EvidenceService(repository),
  });
}

async function authenticatedHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=raw-evidence-session; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    ...extra,
  };
}

const validBody = {
  projectId: "project-1",
  stageId: "stage-1",
  kind: "test",
  title: "CI completo",
  url: "https://github.com/Semogtw/Offline-Toolchains/actions/runs/1",
  externalId: "run-1",
  status: "passed",
  summary: "Gate completo passou.",
  reason: "Registrar a evidência verificada.",
  confirmed: true,
} as const;

beforeEach(() => {
  insertEvidenceWithAudit.mockClear();
  vi.mocked(authProvider.resolveSession).mockClear();
});

describe("private evidence mutation", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=raw-evidence-session`,
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    expect(noCsrf.status).toBe(403);
    expect(insertEvidenceWithAudit).not.toHaveBeenCalled();
  });

  it("persists normalized evidence and audit with request correlation", async () => {
    const correlationId = "evidence-request-0001";
    const response = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: await authenticatedHeaders({ "x-correlation-id": correlationId }),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { evidenceId: expect.any(String) } });
    expect(insertEvidenceWithAudit).toHaveBeenCalledTimes(1);

    const [record, audit] = insertEvidenceWithAudit.mock.calls[0] ?? [];
    expect(record).toMatchObject({
      projectId: validBody.projectId,
      stageId: validBody.stageId,
      kind: "test",
      status: "passed",
      source: "manual",
      sourceHash: null,
    });
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "evidence.create",
      entityType: "evidence",
      confirmed: true,
      correlationId,
    });
  });

  it("keeps domain URL and confirmation validation authoritative", async () => {
    const invalidUrl = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({
        ...validBody,
        url: "https://user:password@example.com/private",
      }),
    });
    expect(invalidUrl.status).toBe(400);
    await expect(invalidUrl.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["URL_INVALID"] },
    });

    const unconfirmed = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ ...validBody, confirmed: false }),
    });
    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        details: ["CONFIRMATION_REQUIRED"],
      },
    });
    expect(insertEvidenceWithAudit).not.toHaveBeenCalled();
  });

  it("bounds request bodies before invoking the command", async () => {
    const response = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ ...validBody, summary: "x".repeat(17 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(insertEvidenceWithAudit).not.toHaveBeenCalled();
  });

  it("sanitizes repository failures", async () => {
    insertEvidenceWithAudit.mockRejectedValueOnce(
      new Error("PRIVATE_FOREIGN_KEY_DETAIL"),
    );
    const response = await app().request("/api/v1/private/evidence", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).not.toContain("PRIVATE_FOREIGN_KEY_DETAIL");
  });
});
