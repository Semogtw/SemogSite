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
    token === "snapshot-token"
      ? {
          id: "semogtw-owner",
          sessionId: "snapshot-session",
          expiresAt: "2026-08-20T00:00:00.000Z",
        }
      : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const run: CooperativeRunSnapshot = {
  id: "cooperative-run-snapshots",
  projectId: "project-1",
  title: "Snapshots opt-in",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "privacy",
  progress: 90,
  branch: "main",
  summary: "Minimizar payload do ledger.",
  blocker: null,
  nextAction: "Validar snapshots.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:50:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:50:00.000Z",
};
const event = {
  id: "event-snapshot-1",
  sequence: 1,
  kind: "run.started",
  actor: "semogtw-owner",
  source: "chatgpt",
  summary: "Run registrada.",
  before: null,
  after: { summary: "sensitive-state-fragment" },
  occurredAt: "2026-08-09T04:00:00.000Z",
  idempotencyKey: "snapshot-idempotency-1",
  correlationId: "snapshot-correlation-1",
};

function app() {
  const queries: PrivateCooperativeRunQueries = {
    listRecent: vi.fn(async () => []),
    findRun: vi.fn(async () => run),
    listEvents: vi.fn(async () => [event]),
  };
  return createApiApp({ authProvider, privateCooperativeRunQueries: queries });
}

function headers() {
  return { cookie: `${SESSION_COOKIE_NAME}=snapshot-token` };
}

describe("cooperative run event snapshots", () => {
  it("omits before/after snapshots by default", async () => {
    const response = await app().request(
      `/api/v1/private/cooperative-runs/${run.id}`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { events: Array<Record<string, unknown>> };
    };
    expect(body.data.events[0]).toMatchObject({
      id: event.id,
      sequence: event.sequence,
      summary: event.summary,
    });
    expect(body.data.events[0]).not.toHaveProperty("before");
    expect(body.data.events[0]).not.toHaveProperty("after");
    expect(JSON.stringify(body)).not.toContain("sensitive-state-fragment");
  });

  it("includes snapshots only when explicitly requested", async () => {
    const response = await app().request(
      `/api/v1/private/cooperative-runs/${run.id}?includeSnapshots=true`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        events: [
          {
            id: event.id,
            before: null,
            after: { summary: "sensitive-state-fragment" },
          },
        ],
      },
    });
  });

  it("rejects arbitrary includeSnapshots values", async () => {
    const response = await app().request(
      `/api/v1/private/cooperative-runs/${run.id}?includeSnapshots=all`,
      { headers: headers() },
    );
    expect(response.status).toBe(400);
  });
});
