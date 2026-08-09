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

const heartbeat = vi.fn(async () => ({
  ok: true,
  run: {
    id: "cooperative-run-1",
    status: "running",
    progress: 25,
    updatedAt: "2026-08-09T04:20:00.000Z",
    finishedAt: null,
  },
}));
const updateProgress = vi.fn(async () => ({
  ok: true,
  run: {
    id: "cooperative-run-1",
    status: "running",
    progress: 60,
    updatedAt: "2026-08-09T04:21:00.000Z",
    finishedAt: null,
  },
}));
const finalize = vi.fn(async () => ({
  ok: true,
  run: {
    id: "cooperative-run-1",
    status: "completed",
    progress: 100,
    updatedAt: "2026-08-09T04:22:00.000Z",
    finishedAt: "2026-08-09T04:22:00.000Z",
  },
}));
const commands = {
  heartbeat,
  updateProgress,
  finalize,
} as unknown as PrivateCooperativeRunTransitionCommands;

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
const common = {
  idempotencyKey: retryKey,
  runId: "cooperative-run-1",
  expectedUpdatedAt: "2026-08-09T04:19:00.000Z",
  summary: "Continuidade registrada.",
  phase: "worker-parity",
  branch: "main",
  blocker: null,
  nextAction: "Continuar o port D1.",
  confirmed: true as const,
};

beforeEach(() => {
  heartbeat.mockClear();
  updateProgress.mockClear();
  finalize.mockClear();
});

describe("private cooperative run transitions", () => {
  it("requires owner authentication and CSRF before invoking commands", async () => {
    const unauthorized = await app().request(
      "/api/v1/private/cooperative-runs/heartbeat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(common),
      },
    );
    expect(unauthorized.status).toBe(401);

    const noCsrf = await app().request(
      "/api/v1/private/cooperative-runs/heartbeat",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=cooperative-transition-token`,
          "content-type": "application/json",
        },
        body: JSON.stringify(common),
      },
    );
    expect(noCsrf.status).toBe(403);
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it("uses retry-stable server event identities for heartbeat", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/heartbeat",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(common),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runId: "cooperative-run-1",
        status: "running",
        progress: 25,
        processStarted: false,
      },
    });
    const [input, context] = heartbeat.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      runId: common.runId,
      expectedUpdatedAt: common.expectedUpdatedAt,
      summary: common.summary,
    });
    expect(input).not.toHaveProperty("idempotencyKey");
    expect(input).not.toHaveProperty("confirmed");
    expect(context).toMatchObject({
      actorId: owner.id,
      eventId: `run-event-heartbeat-${retryKey}`,
      idempotencyKey: `run-heartbeat-${retryKey}`,
      correlationId: `correlation-run-heartbeat-${retryKey}`,
    });
  });

  it("routes progress and finalization without claiming external execution", async () => {
    const progress = await app().request(
      "/api/v1/private/cooperative-runs/progress",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ ...common, progress: 60 }),
      },
    );
    expect(progress.status).toBe(200);
    await expect(progress.json()).resolves.toMatchObject({
      ok: true,
      data: { progress: 60, processStarted: false },
    });
    expect(updateProgress).toHaveBeenCalledTimes(1);

    const completed = await app().request(
      "/api/v1/private/cooperative-runs/finalize",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ ...common, status: "completed" }),
      },
    );
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "completed",
        progress: 100,
        processStarted: false,
      },
    });
    expect(finalize).toHaveBeenCalledTimes(1);
    const [finalizeInput, finalizeContext] = finalize.mock.calls[0] ?? [];
    expect(finalizeInput).toMatchObject({
      status: "completed",
      finalStatus: "completed",
      targetStatus: "completed",
    });
    expect(finalizeContext).toMatchObject({
      eventId: `run-event-finalize-${retryKey}`,
      idempotencyKey: `run-finalize-${retryKey}`,
    });
  });

  it("maps stale and duplicate domain outcomes to conflict", async () => {
    heartbeat.mockResolvedValueOnce({
      ok: false,
      code: "STALE_STATE",
    } as never);
    const stale = await app().request(
      "/api/v1/private/cooperative-runs/heartbeat",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(common),
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_STATE" },
    });

    updateProgress.mockResolvedValueOnce({
      ok: false,
      code: "DUPLICATE",
    } as never);
    const duplicate = await app().request(
      "/api/v1/private/cooperative-runs/progress",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ ...common, progress: 60 }),
      },
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "DUPLICATE" },
    });
  });
});
