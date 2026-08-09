import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import type { VerificationObligationSnapshot } from "@semogtw/domain/orchestration";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateVerificationObligationCommands } from "../src/routes/private/verification-obligations";

const sessionSecret = "verification-obligation-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "verification-obligation-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "verification-obligation-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const obligation: VerificationObligationSnapshot = {
  id: "verification-obligation-stable",
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "cooperative-run-1",
  stageId: "stage-1",
  branch: "main",
  targetCommitSha: "a".repeat(40),
  gateName: "pnpm check",
  command: "pnpm check",
  requiredCapabilities: ["node", "pnpm"],
  responsibleActor: "ChatGPT",
  nextAction: "Executar no toolchain.",
  toolchainManifest: "semogsite",
  status: "pending",
  failureClassification: null,
  failureSignature: null,
  resultSummary: null,
  evidenceUrls: [],
  createdAt: "2026-08-09T20:00:00.000Z",
  lastAttemptAt: null,
  resolvedAt: null,
  version: 1,
};

const create = vi.fn(async () => ({
  ok: true as const,
  obligation,
  audit: {} as never,
}));
const recordResult = vi.fn(async () => ({
  ok: true as const,
  obligation: {
    ...obligation,
    status: "passed" as const,
    resultSummary: "Gate verde.",
    evidenceUrls: ["https://github.com/Semogtw/Offline-Toolchains/actions/runs/1"],
    lastAttemptAt: "2026-08-09T20:15:00.000Z",
    resolvedAt: "2026-08-09T20:15:00.000Z",
    version: 2,
  },
  audit: {} as never,
}));
const supersede = vi.fn(async () => ({
  ok: true as const,
  obligation: {
    ...obligation,
    status: "superseded" as const,
    resolvedAt: "2026-08-09T20:20:00.000Z",
    version: 2,
  },
  audit: {} as never,
}));
const waive = vi.fn(async () => ({
  ok: true as const,
  obligation: {
    ...obligation,
    status: "waived" as const,
    resolvedAt: "2026-08-09T20:21:00.000Z",
    version: 2,
  },
  audit: {} as never,
}));
const commands = {
  create,
  recordResult,
  supersede,
  waive,
} as unknown as PrivateVerificationObligationCommands;

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateVerificationObligations: commands,
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=verification-obligation-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const stableKey = "737fabcd-43fb-41a0-a8fe-ab62588d52dc";
const createBody = {
  idempotencyKey: stableKey,
  projectId: obligation.projectId,
  repositoryId: obligation.repositoryId,
  runId: obligation.runId,
  stageId: obligation.stageId,
  branch: obligation.branch,
  targetCommitSha: obligation.targetCommitSha.toUpperCase(),
  gateName: obligation.gateName,
  command: obligation.command,
  requiredCapabilities: ["PNPM", "node"],
  responsibleActor: obligation.responsibleActor,
  nextAction: obligation.nextAction,
  toolchainManifest: obligation.toolchainManifest,
  confirmed: true as const,
};

beforeEach(() => {
  create.mockClear();
  recordResult.mockClear();
  supersede.mockClear();
  waive.mockClear();
});

describe("private verification obligations", () => {
  it("requires owner authentication and CSRF", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/verification-obligations/create",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/verification-obligations/create",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=verification-obligation-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(createBody),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a gate contract with retry-stable server identities without executing it", async () => {
    const response = await app().request(
      "/api/v1/private/verification-obligations/create",
      { method: "POST", headers: await headers(), body: JSON.stringify(createBody) },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        obligation: { status: "pending" },
        gateExecuted: false,
      },
    });

    const [input, context] = create.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      repositoryId: obligation.repositoryId,
      targetCommitSha: createBody.targetCommitSha,
      requiredCapabilities: createBody.requiredCapabilities,
    });
    expect(context).toMatchObject({
      actorId: owner.id,
      obligationId: `verification-obligation-${stableKey}`,
      auditId: `audit-verification-obligation-${stableKey}`,
      idempotencyKey: `verification-obligation-create-${stableKey}`,
      correlationId: `correlation-verification-obligation-${stableKey}`,
    });
  });

  it("records observed results with stable ledger metadata and no execution claim", async () => {
    const response = await app().request(
      "/api/v1/private/verification-obligations/result",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          obligationId: obligation.id,
          expectedVersion: 1,
          outcome: "passed",
          failureClassification: null,
          resultSummary: "Gate verde.",
          evidenceUrls: ["https://github.com/Semogtw/Offline-Toolchains/actions/runs/1"],
          nextAction: "Prosseguir.",
          confirmed: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { obligation: { status: "passed", version: 2 }, gateExecuted: false },
    });
    expect(recordResult.mock.calls[0]?.[1]).toMatchObject({
      actorId: owner.id,
      obligationId: obligation.id,
      auditId: `audit-verification-result-${stableKey}`,
      idempotencyKey: `verification-result-${stableKey}`,
      correlationId: `correlation-verification-result-${stableKey}`,
    });
  });

  it("exposes supersede and confirmed waiver as explicit owner decisions", async () => {
    const superseded = await app().request(
      "/api/v1/private/verification-obligations/supersede",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          obligationId: obligation.id,
          expectedVersion: 1,
          reason: "Commit substituído.",
          confirmed: true,
        }),
      },
    );
    expect(superseded.status).toBe(200);
    expect(supersede.mock.calls[0]?.[1]).toMatchObject({
      auditId: `audit-verification-supersede-${stableKey}`,
      idempotencyKey: `verification-supersede-${stableKey}`,
    });

    const waived = await app().request(
      "/api/v1/private/verification-obligations/waive",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          obligationId: obligation.id,
          expectedVersion: 1,
          reason: "Exceção consciente.",
          confirmed: true,
        }),
      },
    );
    expect(waived.status).toBe(200);
    expect(waive.mock.calls[0]?.[0]).toMatchObject({ confirmed: true });
    expect(waive.mock.calls[0]?.[1]).toMatchObject({
      auditId: `audit-verification-waive-${stableKey}`,
      idempotencyKey: `verification-waive-${stableKey}`,
    });
  });

  it("maps stale, missing references and validation failures without false success", async () => {
    recordResult.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" } as never);
    const stale = await app().request(
      "/api/v1/private/verification-obligations/result",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          obligationId: obligation.id,
          expectedVersion: 1,
          outcome: "passed",
          failureClassification: null,
          resultSummary: "Gate verde.",
          evidenceUrls: [],
          nextAction: "Prosseguir.",
          confirmed: true,
        }),
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_STATE" },
    });

    create.mockResolvedValueOnce({ ok: false, code: "REPOSITORY_NOT_FOUND" } as never);
    const missing = await app().request(
      "/api/v1/private/verification-obligations/create",
      { method: "POST", headers: await headers(), body: JSON.stringify(createBody) },
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "REPOSITORY_NOT_FOUND" },
    });

    waive.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED"],
    } as never);
    const validation = await app().request(
      "/api/v1/private/verification-obligations/waive",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: stableKey,
          obligationId: obligation.id,
          expectedVersion: 1,
          reason: "Exceção consciente.",
          confirmed: true,
        }),
      },
    );
    expect(validation.status).toBe(400);
    await expect(validation.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["CONFIRMATION_REQUIRED"] },
    });
  });
});
