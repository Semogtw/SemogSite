import { describe, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";

const publicSource = {
  slug: "public-demo",
  name: "Projeto público",
  visibility: "public" as const,
  publicSummary: "Resumo aprovado.",
  publicProgress: null,
  featured: false,
  liveUrl: null,
  documentationUrl: null,
  lastPublicActivityAt: null,
  privateSummary: "PRIVATE_MARKER",
  branchSummary: "private/branch",
  repositoryFullNames: ["Semogtw/private-repository"],
  blockers: ["PRIVATE_BLOCKER"],
  evidenceUrls: [],
  sessionDetails: [],
  auditEventIds: [],
};

describe("API isolation", () => {
  it("never returns operational fields from public project routes", async () => {
    const app = createApiApp({
      publicProjects: {
        list: async () => [publicSource],
        findBySlug: async () => publicSource,
      },
    });

    const response = await app.request("/api/v1/public/projects");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("branchSummary");
    expect(text).not.toContain("privateSummary");
    expect(text).not.toContain("repositoryFullNames");
    expect(text).not.toContain("PRIVATE_MARKER");
  });

  it("omits public records that lack approved editorial content", async () => {
    const incomplete = { ...publicSource, publicSummary: null };
    const app = createApiApp({
      publicProjects: {
        list: async () => [incomplete],
        findBySlug: async () => incomplete,
      },
    });

    const listResponse = await app.request("/api/v1/public/projects");
    await expect(listResponse.json()).resolves.toEqual({ ok: true, data: [] });

    const detailResponse = await app.request(
      "/api/v1/public/projects/public-demo",
    );
    expect(detailResponse.status).toBe(404);
  });

  it("rejects private routes before invoking services and disables caching", async () => {
    const getOverview = vi.fn(async () => ({ activeProjects: 4 }));
    const app = createApiApp({
      authProvider: {
        authenticate: vi.fn(),
        resolveSession: vi.fn(async () => null),
        revokeSession: vi.fn(),
      },
      privateOverview: { getOverview },
    });

    const response = await app.request("/api/v1/private/overview");

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(getOverview).not.toHaveBeenCalled();
  });
});
