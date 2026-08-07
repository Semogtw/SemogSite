import { type AuthProvider } from "@semogtw/auth";
import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const authProvider: AuthProvider = {
  authenticate: vi.fn(async () => ({ ok: false as const, reason: "INVALID_CREDENTIALS" as const })),
  resolveSession: vi.fn(async () => ({
    id: "semogtw-owner",
    sessionId: "session-projects",
    expiresAt: "2026-08-20T00:00:00.000Z",
  })),
  revokeSession: vi.fn(async () => undefined),
};

const project = {
  id: "project-a",
  slug: "project-a",
  name: "Projeto A",
  status: "active" as const,
  health: "healthy" as const,
  priority: "high" as const,
  progressEstimate: 80,
  focus: "Foco atual",
  nextAction: "Próxima ação",
  branchSummary: "main",
  confidence: "high" as const,
  lastActivityAt: null,
  lastSyncedAt: null,
};

describe("private Projects routes", () => {
  it("serves the operational portfolio behind private authentication", async () => {
    const privateProjects = {
      listPortfolio: vi.fn(async () => ({
        activeProjects: [project],
        activeRepositories: [],
        repositoryCatalog: [],
      })),
      getProjectHub: vi.fn(async () => null),
    };
    const app = createApiApp({ authProvider, privateProjects });

    const response = await app.request("/api/v1/private/projects", {
      headers: { cookie: "semogtw_session=raw-token" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(privateProjects.listPortfolio).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { activeProjects: [{ id: "project-a", priority: "high" }] },
    });
  });

  it("serves a project hub and returns 404 for an unknown slug", async () => {
    const hub = {
      project,
      repositories: [],
      currentStages: [],
      attention: [],
      evidence: [],
      recentSessions: [],
      nextGate: null,
      safetyConstraint: null,
      dataSource: "manual" as const,
      updatedAt: "2026-08-07T22:00:00.000Z",
    };
    const privateProjects = {
      listPortfolio: vi.fn(async () => ({
        activeProjects: [],
        activeRepositories: [],
        repositoryCatalog: [],
      })),
      getProjectHub: vi.fn(async (slug: string) =>
        slug === "project-a" ? hub : null,
      ),
    };
    const app = createApiApp({ authProvider, privateProjects });

    const found = await app.request("/api/v1/private/projects/project-a", {
      headers: { cookie: "semogtw_session=raw-token" },
    });
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toMatchObject({
      ok: true,
      data: { project: { id: "project-a" } },
    });

    const missing = await app.request("/api/v1/private/projects/missing", {
      headers: { cookie: "semogtw_session=raw-token" },
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Projeto não encontrado." },
    });
  });
});
