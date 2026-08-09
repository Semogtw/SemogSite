import { SESSION_COOKIE_NAME, type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import type { PrivateCooperativeRunQueries } from "../src/routes/private/cooperative-run-read";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async (token) =>
    token === "running-only-token"
      ? {
          id: "semogtw-owner",
          sessionId: "running-only-session",
          expiresAt: "2026-08-20T00:00:00.000Z",
        }
      : null,
  ),
  revokeSession: vi.fn(async () => undefined),
};

function headers() {
  return { cookie: `${SESSION_COOKIE_NAME}=running-only-token` };
}

describe("running-only cooperative run reads", () => {
  it("maps runningOnly=true to the canonical running status", async () => {
    const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
    listRecent.mockResolvedValue([]);
    const app = createApiApp({
      authProvider,
      privateCooperativeRunQueries: {
        listRecent,
        findRun: vi.fn(),
        listEvents: vi.fn(),
      },
    });

    const response = await app.request(
      "/api/v1/private/cooperative-runs?runningOnly=true&projectId=project-1",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    expect(listRecent).toHaveBeenCalledWith({
      limit: 50,
      projectId: "project-1",
      status: "running",
    });
  });

  it("does not add a status filter for runningOnly=false", async () => {
    const listRecent = vi.fn<PrivateCooperativeRunQueries["listRecent"]>();
    listRecent.mockResolvedValue([]);
    const app = createApiApp({
      authProvider,
      privateCooperativeRunQueries: {
        listRecent,
        findRun: vi.fn(),
        listEvents: vi.fn(),
      },
    });

    const response = await app.request(
      "/api/v1/private/cooperative-runs?runningOnly=false",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    expect(listRecent).toHaveBeenCalledWith({ limit: 50 });
  });

  it("rejects arbitrary status-like values", async () => {
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
      "/api/v1/private/cooperative-runs?runningOnly=completed",
      { headers: headers() },
    );
    expect(response.status).toBe(400);
    expect(listRecent).not.toHaveBeenCalled();
  });
});
