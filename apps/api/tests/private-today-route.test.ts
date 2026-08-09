import { type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({
    ok: false as const,
    reason: "INVALID_CREDENTIALS" as const,
  })),
  resolveSession: vi.fn(async () => ({
    id: "semogtw-owner",
    sessionId: "session-today",
    expiresAt: "2026-08-20T00:00:00.000Z",
  })),
  revokeSession: vi.fn(async () => undefined),
};

describe("private Today route", () => {
  it("serves the queue behind the existing private auth middleware", async () => {
    const privateToday = {
      getQueue: vi.fn(async () => ({
        executeNow: [],
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [],
      })),
    };
    const app = createApiApp({
      authProvider,
      privateToday,
    });

    const response = await app.request("/api/v1/private/today", {
      headers: { cookie: "semogtw_session=raw-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(privateToday.getQueue).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        executeNow: [],
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [],
      },
    });
  });
});
