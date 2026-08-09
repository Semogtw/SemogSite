import { SESSION_COOKIE_NAME, type AuthProvider } from "@semogtw/auth";
import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunQueries } from "../src/routes/private/cooperative-run-read";

const owner = {
  id: "semogtw-owner",
  sessionId: "cooperative-run-pagination-session",
  expiresAt: "2026-08-20T00:00:00.000Z",
};
const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "cooperative-run-pagination-token" ? owner : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

const run: CooperativeRunSnapshot = {
  id: "cooperative-run-page-2",
  projectId: "project-1",
  title: "Página seguinte",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "pagination",
  progress: 80,
  branch: "main",
  summary: "Cursor validado.",
  blocker: null,
  nextAction: "Continuar.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:40:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:40:00.000Z",
};

function headers() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=cooperative-run-pagination-token`,
  };
}

describe("cooperative run keyset pagination", () => {
  it("requires a complete updatedAt/id cursor pair", async () => {
    const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
    const app = createApiApp({
      authProvider,
      privateCooperativeRunQueries: {
        listRecent,
        findRun: vi.fn(),
        listEvents: vi.fn(),
      },
    });

    const response = await app.request(
      "/api/v1/private/cooperative-runs?beforeUpdatedAt=2026-08-09T04%3A45%3A00.000Z",
      { headers: headers() },
    );
    expect(response.status).toBe(400);
    expect(listRecent).not.toHaveBeenCalled();
  });

  it("passes the keyset cursor to storage and returns the next cursor", async () => {
    const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
    listRecent.mockResolvedValue([run]);
    const app = createApiApp({
      authProvider,
      privateCooperativeRunQueries: {
        listRecent,
        findRun: vi.fn(),
        listEvents: vi.fn(),
      },
    });

    const response = await app.request(
      "/api/v1/private/cooperative-runs?limit=1&projectId=project-1&beforeUpdatedAt=2026-08-09T04%3A45%3A00.000Z&beforeId=cooperative-run-page-3",
      { headers: headers() },
    );

    expect(response.status).toBe(200);
    expect(listRecent).toHaveBeenCalledWith({
      limit: 1,
      projectId: "project-1",
      cursor: {
        updatedAt: "2026-08-09T04:45:00.000Z",
        id: "cooperative-run-page-3",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        nextCursor: {
          updatedAt: run.updatedAt,
          id: run.id,
        },
      },
    });
  });

  it("returns a null cursor when the page is shorter than the requested limit", async () => {
    const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
    listRecent.mockResolvedValue([run]);
    const app = createApiApp({
      authProvider,
      privateCooperativeRunQueries: {
        listRecent,
        findRun: vi.fn(),
        listEvents: vi.fn(),
      },
    });

    const response = await app.request(
      "/api/v1/private/cooperative-runs?limit=2",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { nextCursor: null },
    });
  });
});
