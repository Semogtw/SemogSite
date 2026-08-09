import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  AttentionCaptureService,
  type AttentionCaptureRepository,
  type CaptureAuditEvent,
  type CapturedAttention,
} from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "s".repeat(32);
const owner = {
  id: "semogtw-owner",
  sessionId: "session-attention-1",
  expiresAt: "2026-08-20T00:00:00.000Z",
};

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (rawToken) =>
    rawToken === "raw-session" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const insertAttentionWithAudit = vi.fn(
  async (_attention: CapturedAttention, _audit: CaptureAuditEvent) => undefined,
);
const repository: AttentionCaptureRepository = { insertAttentionWithAudit };

function app() {
  return createApiApp({
    auth: {
      provider: authProvider,
      sessionSecret,
      nodeEnv: "test",
    },
    privateAttention: new AttentionCaptureService(repository),
  });
}

async function authenticatedHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=raw-session; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    ...extra,
  };
}

const validBody = {
  type: "critical_test",
  impact: "high",
  title: "Executar preview Cloudflare",
  nextAction: "Validar autenticação e escrita no edge.",
  reason: "O gate remoto ainda precisa de evidência.",
  confirmed: true,
} as const;

beforeEach(() => {
  insertAttentionWithAudit.mockClear();
  vi.mocked(authProvider.resolveSession).mockClear();
});

describe("private attention mutation", () => {
  it("requires an authenticated owner before CSRF validation", async () => {
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(401);
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });

  it("rejects an authenticated mutation without a valid CSRF pair", async () => {
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=raw-session`,
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "CSRF_INVALID" },
    });
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });

  it("persists a confirmed attention and audit with the request correlation id", async () => {
    const correlationId = "attention-request-0001";
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: await authenticatedHeaders({ "x-correlation-id": correlationId }),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-correlation-id")).toBe(correlationId);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { attentionId: expect.any(String) } });
    expect(insertAttentionWithAudit).toHaveBeenCalledTimes(1);

    const [attention, audit] = insertAttentionWithAudit.mock.calls[0] ?? [];
    expect(attention).toMatchObject({
      projectId: null,
      type: "critical_test",
      owner: "external_environment",
      status: "open",
      title: validBody.title,
    });
    expect(audit).toMatchObject({
      actor: owner.id,
      action: "attention.create",
      entityType: "attention_item",
      reason: validBody.reason,
      confirmed: true,
      correlationId,
    });
  });

  it("keeps domain confirmation validation authoritative", async () => {
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ ...validBody, confirmed: false }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        details: ["CONFIRMATION_REQUIRED"],
      },
    });
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });

  it("rejects oversized capture bodies before the command executes", async () => {
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify({ ...validBody, reason: "x".repeat(9 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });

  it("sanitizes storage failures", async () => {
    insertAttentionWithAudit.mockRejectedValueOnce(
      new Error("PRIVATE_D1_CONSTRAINT_DETAIL"),
    );
    const response = await app().request("/api/v1/private/attention", {
      method: "POST",
      headers: await authenticatedHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).not.toContain("PRIVATE_D1_CONSTRAINT_DETAIL");
  });
});
