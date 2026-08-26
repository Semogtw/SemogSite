import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createPublicEditorialRoutes } from "../src/routes/public/editorial";

const document = {
  kind: "project" as const,
  slug: "semogsite",
  title: "SemogSite",
  excerpt: "Portfólio público.",
  bodyMarkdown: "# SemogSite\n\nConteúdo público.",
  tags: ["typescript"],
  contentHash: "a".repeat(64),
  publishedRevisionId: "revision-public-1",
  updatedAt: "2026-08-25T12:00:00.000Z",
};

function mount(queries: Parameters<typeof createPublicEditorialRoutes>[0]) {
  const app = new Hono();
  app.route("/api/v1/public/editorial", createPublicEditorialRoutes(queries));
  return app;
}

describe("public editorial routes", () => {
  it("lists only the requested public editorial kind with a bounded limit", async () => {
    const calls: unknown[] = [];
    const api = mount({
      listSummaries: async (input) => {
        calls.push(input);
        return [
          {
            kind: document.kind,
            slug: document.slug,
            title: document.title,
            excerpt: document.excerpt,
            tags: document.tags,
            updatedAt: document.updatedAt,
          },
        ];
      },
      findBySlug: async () => null,
      resolveRedirect: async () => null,
    });

    const response = await api.request(
      "http://localhost/api/v1/public/editorial/project?limit=500",
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ kind: "project", limit: 100 }]);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: [
        {
          kind: "project",
          slug: "semogsite",
          title: "SemogSite",
          excerpt: "Portfólio público.",
          tags: ["typescript"],
          updatedAt: "2026-08-25T12:00:00.000Z",
        },
      ],
    });
  });

  it("returns a canonical published document", async () => {
    const api = mount({
      listSummaries: async () => [],
      findBySlug: async () => document,
      resolveRedirect: async () => null,
    });

    const response = await api.request(
      "http://localhost/api/v1/public/editorial/project/semogsite",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: document });
  });

  it("does not serve a published document through the wrong editorial kind", async () => {
    const api = mount({
      listSummaries: async () => [],
      findBySlug: async () => document,
      resolveRedirect: async () => null,
    });

    const response = await api.request(
      "http://localhost/api/v1/public/editorial/note/semogsite",
    );
    expect(response.status).toBe(404);
  });

  it("returns 308 for a reviewed alias and 404 for a missing projection", async () => {
    const api = mount({
      listSummaries: async () => [],
      findBySlug: async () => null,
      resolveRedirect: async (slug) =>
        slug === "site-antigo" ? { targetSlug: "semogsite" } : null,
    });

    const alias = await api.request(
      "http://localhost/api/v1/public/editorial/project/site-antigo",
      { redirect: "manual" },
    );
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe(
      "/api/v1/public/editorial/project/semogsite",
    );

    const missing = await api.request(
      "http://localhost/api/v1/public/editorial/project/missing",
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects unsupported kinds and malformed limits without reaching the reader", async () => {
    let calls = 0;
    const api = mount({
      listSummaries: async () => {
        calls += 1;
        return [];
      },
      findBySlug: async () => {
        calls += 1;
        return null;
      },
      resolveRedirect: async () => {
        calls += 1;
        return null;
      },
    });

    expect(
      (await api.request("http://localhost/api/v1/public/editorial/private")).status,
    ).toBe(404);
    expect(
      (
        await api.request(
          "http://localhost/api/v1/public/editorial/project?limit=NaN",
        )
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
  });
});
