import { type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({ ok: false as const, reason: "INVALID_CREDENTIALS" as const })),
  resolveSession: vi.fn(async () => ({
    id: "semogtw-owner",
    sessionId: "session-workflows",
    expiresAt: "2026-08-20T00:00:00.000Z",
  })),
  revokeSession: vi.fn(async () => undefined),
};

describe("private Workflows route", () => {
  it("serves a deterministic orchestration dashboard", async () => {
    const privateWorkflows = {
      getDashboard: vi.fn(async (observedAt: string) => ({
        observedAt: new Date(observedAt).toISOString(),
        summary: {
          activeReservations: 0,
          expiredReservations: 0,
          unresolvedObligations: 0,
          environmentBlockedObligations: 0,
        },
        reservations: [],
        obligations: [],
      })),
    };
    const app = createApiApp({ authProvider, privateWorkflows });

    const response = await app.request(
      "/api/v1/private/workflows?observedAt=2026-08-07T19%3A00%3A00-03%3A00",
      { headers: { cookie: "semogtw_session=raw-token" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(privateWorkflows.getDashboard).toHaveBeenCalledWith(
      "2026-08-07T19:00:00-03:00",
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { observedAt: "2026-08-07T22:00:00.000Z" },
    });
  });

  it("rejects an invalid observedAt before reading storage", async () => {
    const privateWorkflows = { getDashboard: vi.fn() };
    const app = createApiApp({ authProvider, privateWorkflows });

    const response = await app.request(
      "/api/v1/private/workflows?observedAt=not-a-date",
      { headers: { cookie: "semogtw_session=raw-token" } },
    );

    expect(response.status).toBe(400);
    expect(privateWorkflows.getDashboard).not.toHaveBeenCalled();
  });
});
