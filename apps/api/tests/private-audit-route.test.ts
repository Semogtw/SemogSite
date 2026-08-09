import { type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({ ok: false as const, reason: "INVALID_CREDENTIALS" as const })),
  resolveSession: vi.fn(async () => ({
    id: "semogtw-owner",
    sessionId: "session-audit",
    expiresAt: "2026-08-20T00:00:00.000Z",
  })),
  revokeSession: vi.fn(async () => undefined),
};

describe("private Audit route", () => {
  it("passes validated pagination and exact filters to the audit source", async () => {
    const privateAudit = {
      list: vi.fn(async () => ({
        items: [],
        page: 2,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      })),
    };
    const app = createApiApp({ authProvider, privateAudit });

    const response = await app.request(
      "/api/v1/private/audit?page=2&pageSize=25&action=evidence.create&entityType=evidence",
      { headers: { cookie: "semogtw_session=raw-token" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(privateAudit.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      action: "evidence.create",
      entityType: "evidence",
    });
  });

  it("rejects invalid pagination without calling storage", async () => {
    const privateAudit = {
      list: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      })),
    };
    const app = createApiApp({ authProvider, privateAudit });

    const response = await app.request(
      "/api/v1/private/audit?page=0&pageSize=101",
      { headers: { cookie: "semogtw_session=raw-token" } },
    );

    expect(response.status).toBe(400);
    expect(privateAudit.list).not.toHaveBeenCalled();
  });
});
