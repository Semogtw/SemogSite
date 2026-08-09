import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunTransitionCommands } from "../src/routes/private/cooperative-run-transitions";

const sessionSecret = "cooperative-transition-secret-12345";
const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-transition-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-transition-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const transition = vi.fn(async () => ({
  ok: true as const,
  run: {
    id: "cooperative-run-1",
    projectId: null,
    title: "Continuar Worker parity",
    actorLabel: "ChatGPT",
    origin: "chatgpt" as const,
    status: "running" as const,
    phase: "worker-parity",
    progress: 60,
    branch: "main",
    summary: "Checkpoint registrado.",
    blocker: null,
    nextAction: "Continuar.",
    startedAt: "2026-08-09T04:00:00.000Z",
    lastHeartbeatAt: "2026-08-09T04:21:00.000Z",
    finishedAt: null,
    staleAfterSeconds: 1800,
    updatedAt: "2026-08-09T04:21:00.000Z",
  },
  event: {
    id: "event-1",
    runId: "cooperative-run-1",
    kind: "run.checkpoint" as const,
    actor: owner.id,
    source: "manual" as const,
    summary: "Checkpoint registrado.",
    before: {} as never,
    after: {} as never,
    occurredAt: "2026-08-09T04:21:00.000Z",
    idempotencyKey: "key",
    correlationId: "correlation",
  },
}));
const commands = { transition } as unknown as PrivateCooperativeRunTransitionCommands;

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRunTransitions: commands,
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-transition-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

const retryKey = "2b59d8e2-4afe-4731-9184-c7100422810f";
const checkpoint = {
  idempotencyKey: retryKey,
  runId: "cooperative-run-1",
  expectedUpdatedAt: "2026-08-09T04:19:00.000Z",
  kind: "checkpoint" as const,
  progress: 60,
  summary: "Checkpoint registrado.",
  phase: "worker-parity",
  branch: "main",
  nextAction: "Continuar.",
  confirmed: true as const,
};

beforeEach(() => {
  transition.mockClear();
});

describe("private cooperative run transition", () => {
  it("requires owner authentication and CSRF before invoking the domain", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=cooperative-transition-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
  });

  it("maps checkpoint input to the canonical domain command with retry-stable metadata", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/transition",
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
        runId: "cooperative-run-1",
        status: "running",
        progress: 60,
        processStarted: false,
      },
    });

    const [input, context] = transition.mock.calls[0] ?? [];
    expect(input).toEqual({
      runId: checkpoint.runId,
      command: {
        kind: "checkpoint",
        progress: 60,
        summary: checkpoint.summary,
        phase: checkpoint.phase,
        branch: checkpoint.branch,
        nextAction: checkpoint.nextAction,
      },
    });
    expect(context).toMatchObject({
      actorId: owner.id,
      eventId: `run-event-owner-transition-${retryKey}`,
      idempotencyKey: `owner-run-transition-${retryKey}`,
      correlationId: `correlation-owner-transition-${retryKey}`,
      source: "manual",
      expectedUpdatedAt: checkpoint.expectedUpdatedAt,
    });
  });

  it("supports heartbeat and terminal commands without inventing process execution", async () => {
    const heartbeat = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          ...checkpoint,
          kind: "heartbeat",
          summary: null,
          phase: null,
          branch: null,
          nextAction: null,
          progress: undefined,
        }),
      },
    );
    expect(heartbeat.status).toBe(200);
    const heartbeatInput = transition.mock.calls[0]?.[0];
    expect(heartbeatInput).toEqual({
      runId: checkpoint.runId,
      command: {
        kind: "heartbeat",
        phase: null,
        branch: null,
      },
    });

    transition.mockClear();
    const completed = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: retryKey,
          runId: checkpoint.runId,
          expectedUpdatedAt: checkpoint.expectedUpdatedAt,
          kind: "complete",
          progress: 100,
          summary: "Concluído.",
          confirmed: true,
        }),
      },
    );
    expect(completed.status).toBe(200);
    expect(transition.mock.calls[0]?.[0]).toEqual({
      runId: checkpoint.runId,
      command: { kind: "complete", progress: 100, summary: "Concluído." },
    });
  });

  it("maps domain stale, invalid-state and duplicate outcomes without false success", async () => {
    transition.mockResolvedValueOnce({
      ok: false,
      code: "STALE_STATE",
    } as never);
    const stale = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      { method: "POST", headers: await headers(), body: JSON.stringify(checkpoint) },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_STATE" },
    });

    transition.mockResolvedValueOnce({
      ok: false,
      code: "INVALID_CURRENT_STATE",
      errors: ["RUNNING_NEXT_ACTION_REQUIRED"],
    } as never);
    const invalid = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      { method: "POST", headers: await headers(), body: JSON.stringify(checkpoint) },
    );
    expect(invalid.status).toBe(409);
    await expect(invalid.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_CURRENT_STATE",
        details: ["RUNNING_NEXT_ACTION_REQUIRED"],
      },
    });

    transition.mockResolvedValueOnce({ ok: false, code: "DUPLICATE" } as never);
    const duplicate = await app().request(
      "/api/v1/private/cooperative-runs/transition",
      { method: "POST", headers: await headers(), body: JSON.stringify(checkpoint) },
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE" },
    });
  });
});
