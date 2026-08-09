import { SESSION_COOKIE_NAME, type AuthProvider } from "@semogtw/auth";
import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunQueries } from "../src/routes/private/cooperative-run-read";

const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-run-read-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-run-read-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const run: CooperativeRunSnapshot = {
  id: "cooperative-run-1",
  projectId: "project-1",
  title: "Ler ledger privado",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "read-model",
  progress: 70,
  branch: "main",
  summary: "Leitura implementada.",
  blocker: null,
  nextAction: "Validar API.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:30:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:30:00.000Z",
};
const event = {
  id: "event-2",
  sequence: 2,
  kind: "progress.updated",
  actor: owner.id,
  source: "chatgpt",
  summary: "Progresso atualizado.",
  before: { progress: 40 },
  after: { progress: 70 },
  occurredAt: "2026-08-09T04:30:00.000Z",
  idempotencyKey: "run-progress-2",
  correlationId: "correlation-run-progress-2",
};

const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
const findRun = vi.fn<PrivateCooperativeRunQueries["findRun"]>();
const listEvents = vi.fn<PrivateCooperativeRunQueries["listEvents"]>();
const queries: PrivateCooperativeRunQueries = {
  listRecent,
  findRun,
  listEvents,
};

function app() {
  return createApiApp({
    authProvider,
    privateCooperativeRunQueries: queries,
  });
}

function headers() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-run-read-token`,
  };
}

beforeEach(() => {
  listRecent.mockReset();
  listRecent.mockResolvedValue([run]);
  findRun.mockReset();
  findRun.mockResolvedValue(run);
  listEvents.mockReset();
  listEvents.mockResolvedValue([event]);
});

describe("private cooperative run reads", () => {
  it("requires owner authentication", async () => {
    const response = await app().request("/api/v1/private/cooperative-runs");
    expect(response.status).toBe(401);
    expect(listRecent).not.toHaveBeenCalled();
  });

  it("lists recent runs with bounded pagination and private no-store cache", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs?limit=25",
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(listRecent).toHaveBeenCalledWith({ limit: 25 });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { runs: [{ id: run.id, progress: 70 }] },
    });
  });

  it("rejects invalid list limits before storage access", async () => {
    const response = await app().request(
      "/api/v1/private/cooperative-runs?limit=1000",
      { headers: headers() },
    );
    expect(response.status).toBe(400);
    expect(listRecent).not.toHaveBeenCalled();
  });

  it("returns run detail with a bounded event history", async () => {
    const response = await app().request(
      `/api/v1/private/cooperative-runs/${run.id}?eventLimit=50`,
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(findRun).toHaveBeenCalledWith(run.id);
    expect(listEvents).toHaveBeenCalledWith(run.id, 50);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        run: { id: run.id },
        events: [{ id: event.id, sequence: 2 }],
      },
    });
  });

  it("returns 404 without querying events when the run is absent", async () => {
    findRun.mockResolvedValueOnce(null);
    const response = await app().request(
      "/api/v1/private/cooperative-runs/missing-run",
      { headers: headers() },
    );

    expect(response.status).toBe(404);
    expect(listEvents).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RUN_NOT_FOUND" },
    });
  });

  it("sanitizes storage failures", async () => {
    listRecent.mockRejectedValueOnce(new Error("D1 sensitive details"));
    const response = await app().request(
      "/api/v1/private/cooperative-runs",
      { headers: headers() },
    );
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).not.toContain("D1 sensitive details");
  });
});
