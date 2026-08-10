import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  issueCsrfToken,
  type AuthProvider,
} from "@semogtw/auth";
import {
  CooperativeRunTransitionService,
  type CooperativeRunSnapshot,
  type CooperativeRunTransitionRepository,
} from "@semogtw/domain";
import { expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "run-finalize-domain-integration-secret";
const owner = {
  id: "semogtw-owner",
  sessionId: "run-finalize-domain-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "run-finalize-domain-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};
const initial: CooperativeRunSnapshot = {
  id: "cooperative-run-finalize-1",
  projectId: "project-1",
  title: "Finalizar port D1",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "validation",
  progress: 90,
  branch: "main",
  summary: "Gate final pendente.",
  blocker: null,
  nextAction: "Finalizar execução.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:25:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:25:00.000Z",
};
const findRun = vi.fn<CooperativeRunTransitionRepository["findRun"]>(async () => initial);
const apply = vi.fn<CooperativeRunTransitionRepository["apply"]>(async () => "updated" as const);
const repository: CooperativeRunTransitionRepository = {
  findRun,
  apply,
};

it("passes finalization through the real domain service", async () => {
  const app = createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRunTransitions: new CooperativeRunTransitionService(
      repository,
    ),
  });
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  const response = await app.request(
    "/api/v1/private/cooperative-runs/transition",
    {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=run-finalize-domain-token; ${CSRF_COOKIE_NAME}=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotencyKey: "64e777e9-0215-4367-8dd1-d2fe530c8a0b",
        runId: initial.id,
        expectedUpdatedAt: initial.updatedAt,
        kind: "complete",
        progress: 100,
        summary: "Port D1 concluído.",
        confirmed: true,
      }),
    },
  );

  expect(response.status).toBe(200);
  expect(apply).toHaveBeenCalledTimes(1);
  const [before, after, event] = apply.mock.calls[0] ?? [];
  expect(before).toEqual(initial);
  expect(after).toMatchObject({
    id: initial.id,
    status: "completed",
    progress: 100,
    summary: "Port D1 concluído.",
    finishedAt: expect.any(String),
  });
  expect(event).toMatchObject({
    runId: initial.id,
    actor: owner.id,
    kind: "run.completed",
  });
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    data: {
      runId: initial.id,
      status: "completed",
      progress: 100,
      processStarted: false,
    },
  });
});
