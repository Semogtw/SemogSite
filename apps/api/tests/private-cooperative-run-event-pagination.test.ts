import { SESSION_COOKIE_NAME, type AuthProvider } from "@semogtw/auth";
import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunQueries } from "../src/routes/private/cooperative-run-read";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "event-pagination-token"
      ? {
          id: "semogtw-owner",
          sessionId: "event-pagination-session",
          expiresAt: "2026-08-20T00:00:00.000Z",
        }
      : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const run: CooperativeRunSnapshot = {
  id: "cooperative-run-events-1",
  projectId: "project-1",
  title: "Paginar eventos",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "event-pagination",
  progress: 85,
  branch: "main",
  summary: "Paginação em validação.",
  blocker: null,
  nextAction: "Continuar.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:45:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:45:00.000Z",
};
const event = {
  id: "event-9",
  sequence: 9,
  kind: "progress.updated",
  actor: "semogtw-owner",
  source: "chatgpt",
  summary: "Evento paginado.",
  before: { progress: 80 },
  after: { progress: 85 },
  occurredAt: "2026-08-09T04:45:00.000Z",
  idempotencyKey: "event-pagination-9",
  correlationId: "event-pagination-correlation-9",
};

function headers() {
  return { cookie: `${SESSION_COOKIE_NAME}=event-pagination-token` };
}

function appWith(listEvents: PrivateCooperativeRunQueries["listEvents"]) {
  return createApiApp({
    authProvider,
    privateCooperativeRunQueries: {
      listRecent: vi.fn(async () => []),
      findRun: vi.fn(async () => run),
      listEvents,
    },
  });
}

describe("cooperative run event pagination", () => {
  it("passes beforeSequence to storage and returns a next event cursor", async () => {
    const listEvents = vi.fn<PrivateCooperativeRunQueries["listEvents"]>();
    listEvents.mockResolvedValue([event]);
    const response = await appWith(listEvents).request(
      `/api/v1/private/cooperative-runs/${run.id}?eventLimit=1&beforeSequence=10`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith(run.id, {
      limit: 1,
      beforeSequence: 10,
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        events: [{ id: event.id, sequence: 9 }],
        nextEventCursor: 9,
      },
    });
  });

  it("returns null when the event page is shorter than the requested limit", async () => {
    const listEvents = vi.fn<PrivateCooperativeRunQueries["listEvents"]>();
    listEvents.mockResolvedValue([event]);
    const response = await appWith(listEvents).request(
      `/api/v1/private/cooperative-runs/${run.id}?eventLimit=2`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { nextEventCursor: null },
    });
  });

  it("rejects zero or negative event cursors before storage access", async () => {
    const listEvents = vi.fn<PrivateCooperativeRunQueries["listEvents"]>();
    const response = await appWith(listEvents).request(
      `/api/v1/private/cooperative-runs/${run.id}?beforeSequence=0`,
      { headers: headers() },
    );

    expect(response.status).toBe(400);
    expect(listEvents).not.toHaveBeenCalled();
  });
});
