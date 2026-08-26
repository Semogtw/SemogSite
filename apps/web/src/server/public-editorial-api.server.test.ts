import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://portfolio.example/server-fn"),
}));

import {
  readPublicEditorialFromApi,
  readPublicEditorialRouteFromApi,
} from "./public-editorial-api.server";

const summary = {
  kind: "project" as const,
  slug: "semog-site",
  title: "SemogSite",
  excerpt: "Public excerpt.",
  tags: ["typescript"],
  updatedAt: "2026-08-25T20:00:00.000Z",
};

const document = {
  ...summary,
  bodyMarkdown: "# SemogSite",
  contentHash: "a".repeat(64),
  publishedRevisionId: "revision-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public editorial API reader", () => {
  it("reads a validated same-origin summary list", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://portfolio.example/api/v1/public/editorial/project?limit=20",
      );
      return Response.json({ ok: true, data: [summary] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readPublicEditorialFromApi({ kind: "project", limit: 20 }),
    ).resolves.toEqual([summary]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a canonical API alias as a public redirect slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 308,
          headers: {
            location: "/api/v1/public/editorial/project/semog-site",
          },
        }),
      ),
    );

    await expect(
      readPublicEditorialRouteFromApi("site-antigo", "project"),
    ).resolves.toEqual({ document: null, redirectSlug: "semog-site" });
  });

  it("distinguishes a missing publication from an unavailable API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(
      readPublicEditorialRouteFromApi("missing", "project"),
    ).resolves.toEqual({ document: null, redirectSlug: null });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(
      readPublicEditorialRouteFromApi("missing", "project"),
    ).rejects.toThrow("PUBLIC_EDITORIAL_API_DOCUMENT_503");
  });

  it("rejects malformed public payloads instead of rendering them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, data: { ...document, kind: "private" } })),
    );

    await expect(
      readPublicEditorialRouteFromApi("semog-site", "project"),
    ).rejects.toThrow();
  });
});
