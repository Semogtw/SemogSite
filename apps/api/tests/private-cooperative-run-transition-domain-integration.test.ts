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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const sessionSecret = "run-transition-domain-integration-secret";
const owner = {
  id: "semogtw-owner",
  sessionId: "run-transition-domain-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "run-transition-domain-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const initial: CooperativeRunSnapshot = {
  id: "cooperative-run-domain-1",
  projectId: "project-1",
  title: "Validar rota e domínio",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "implementation",
  progress: 25,
  branch: "main",
  summary: "Implementação em andamento.",
  blocker: null,
  nextAction: "Validar integração.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:05:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:05:00.000Z",
};

const findRun = vi.fn(async () => initial);
const transition = vi.fn(async () => "updated" as const);
const repository = {
  findRun,
  transition,
} as unknown as CooperativeRunTransitionRepository;

function app() {
  return createApiApp({
    auth: { provider: authProvider, sessionSecret, nodeEnv: "test" },
    privateCooperativeRunTransitions: new CooperativeRunTransitionService(
      repository,
    ),
  });
}

async function headers() {
  const csrf = await issueCsrfToken(sessionSecret, owner.sessionId);
  return {
    cookie: `${SESSION_COOKIE_NAME}=run-transition-domain-token; ${CSRF_COOKIE_NAME}=${csrf}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

beforeEach(() => {
  findRun.mockClear();
  transition.mockClear();
});

describe("cooperative run route/domain integration", () => {
  it("passes heartbeat data through the real domain transition service", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/heartbeat",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: "04013acb-c9c7-4a36-8605-a7c297507fad",
          runId: initial.id,
          expectedUpdatedAt: initial.updatedAt,
          summary: "Heartbeat confirmado.",
          phase: "validation",
          branch: "main",
          blocker: null,
          nextAction: "Continuar validação.",
          confirmed: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(findRun).toHaveBeenCalledWith(initial.id);
    expect(transition).toHaveBeenCalledTimes(1);
    const [before, after, event] = transition.mock.calls[0] ?? [];
    expect(before).toEqual(initial);
    expect(after).toMatchObject({
      id: initial.id,
      status: "running",
      phase: "validation",
      summary: "Heartbeat confirmado.",
      nextAction: "Continuar validação.",
    });
    expect(event).toMatchObject({
      runId: initial.id,
      actor: owner.id,
      kind: "run.heartbeat",
    });
  });

  it("passes monotonic progress through the real domain transition service", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs/progress",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          idempotencyKey: "750b075a-ac3f-4070-9c42-bd99950b4e20",
          runId: initial.id,
          expectedUpdatedAt: initial.updatedAt,
          progress: 60,
          summary: "Integração validada.",
          phase: "validation",
          branch: "main",
          blocker: null,
          nextAction: "Rodar gate.",
          confirmed: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(transition).toHaveBeenCalledTimes(1);
    const [, after, event] = transition.mock.calls[0] ?? [];
    expect(after).toMatchObject({
      progress: 60,
      summary: "Integração validada.",
      nextAction: "Rodar gate.",
    });
    expect(event).toMatchObject({
      runId: initial.id,
      actor: owner.id,
      kind: "progress.updated",
    });
  });
});
