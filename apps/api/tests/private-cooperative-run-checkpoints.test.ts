import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunCheckpointCommands } from "../src/routes/private/cooperative-run-checkpoints";

const sessionSecret = "cooperative-checkpoint-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-checkpoint-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-checkpoint-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const record = vi.fn<PrivateCooperativeRunCheckpointCommands["record"]>(async () => ({
  ok: true as const,
  run: {
    id: "cooperative-run-1",
    projectId: null,
    title: "Continuar Worker parity",
    actorLabel: "ChatGPT",
    origin: "chatgpt" as const,
    status: "running" as const,
    phase: "worker-parity",
    progress: 70,
    branch: "main",
    summary: "Checkpoint com evidência.",
    blocker: null,
    nextAction: "Continuar.",
    startedAt: "2026-08-09T04:00:00.000Z",
    lastHeartbeatAt: "2026-08-09T04:25:00.000Z",
    finishedAt: null,
    staleAfterSeconds: 1800,
    updatedAt: "2026-08-09T04:25:00.000Z",
  },
  event: {} as never,
  checkpoint: {
    id: "checkpoint-1",
    runId: "cooperative-run-1",
    eventId: "event-1",
    phase: "worker-parity",
    progress: 70,
    branch: "main",
    summary: "Checkpoint com evidência.",
    commits: ["abcdef1"],
    testsStatus: "partial" as const,
    testsSummary: "Typecheck pendente.",
    blockers: "",
    nextStep: "Continuar.",
    capturedAt: "2026-08-09T04:25:00.000Z",
    sourceHash: "hash",
  },
}));
const commands: PrivateCooperativeRunCheckpointCommands = { record };

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRunCheckpoints: commands,
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-checkpoint-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const retryKey = "a259d8e2-4afe-4731-9184-c7100422810f";
const checkpoint = {
  idempotencyKey: retryKey,
  runId: "cooperative-run-1",
  expectedUpdatedAt: "2026-08-09T04:19:00.000Z",
  progress: 70,
  phase: "worker-parity",
  branch: "main",
  summary: "Checkpoint com evidência.",
  commits: ["ABCDEF1", "1234567"],
  testsStatus: "partial" as const,
  testsSummary: "Typecheck pendente.",
  blockers: "",
  nextStep: "Continuar.",
  confirmed: true as const,
};

beforeEach(() => {
  record.mockClear();
});

describe("private cooperative run checkpoint", () => {
  it("requires owner authentication and CSRF before invoking the domain", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/cooperative-runs/checkpoint",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/cooperative-runs/checkpoint",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=cooperative-checkpoint-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });

  it("maps evidence payload to the checkpoint service with retry-stable metadata", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/checkpoint",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(checkpoint),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runId: checkpoint.runId,
        checkpointId: "checkpoint-1",
        progress: 70,
        testsStatus: "partial",
        processStarted: false,
      },
    });

    const [input, context] = record.mock.calls[0] ?? [];
    expect(input).toEqual({
      runId: checkpoint.runId,
      progress: checkpoint.progress,
      phase: checkpoint.phase,
      branch: checkpoint.branch,
      summary: checkpoint.summary,
      commits: checkpoint.commits,
      testsStatus: checkpoint.testsStatus,
      testsSummary: checkpoint.testsSummary,
      blockers: checkpoint.blockers,
      nextStep: checkpoint.nextStep,
    });
    expect(context).toMatchObject({
      actorId: owner.id,
      eventId: `run-event-owner-checkpoint-${retryKey}`,
      checkpointId: `run-checkpoint-${retryKey}`,
      idempotencyKey: `owner-run-checkpoint-${retryKey}`,
      correlationId: `correlation-owner-checkpoint-${retryKey}`,
      source: "manual",
      expectedUpdatedAt: checkpoint.expectedUpdatedAt,
    });
    expect(context?.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("maps stale and validation outcomes without false success", async () => {
    record.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" } as never);
    const stale = await app().request(
      "/api/v1/private/cooperative-runs/checkpoint",
      { method: "POST", headers: await headers(), body: JSON.stringify(checkpoint) },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_STATE" },
    });

    record.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["COMMIT_INVALID"],
    } as never);
    const invalid = await app().request(
      "/api/v1/private/cooperative-runs/checkpoint",
      { method: "POST", headers: await headers(), body: JSON.stringify(checkpoint) },
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", details: ["COMMIT_INVALID"] },
    });
  });
});
