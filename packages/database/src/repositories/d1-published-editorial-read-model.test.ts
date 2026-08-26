import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1PublishedEditorialReadModel } from "./d1-published-editorial-read-model";

const publishedAt = "2026-08-25T12:00:00.000Z";
const projectionRow = {
  kind: "project",
  slug: "semogsite",
  title: "SemogSite",
  excerpt: "Portfólio público com publicação editorial.",
  body_markdown: "# SemogSite\n\nConteúdo público.",
  tags_json: '["typescript","cloudflare"]',
  content_hash: "a".repeat(64),
  published_revision_id: "revision-public-1",
  published_at: publishedAt,
} as const;

class FakeStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly binding: FakeBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new FakeStatement(this.binding, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    this.binding.executed.push({ sql: this.sql, params: this.params });
    if (this.sql.includes("revision.body_markdown")) {
      return { results: [projectionRow as Row] };
    }
    return {
      results: [
        {
          kind: projectionRow.kind,
          slug: projectionRow.slug,
          title: projectionRow.title,
          excerpt: projectionRow.excerpt,
          tags_json: projectionRow.tags_json,
          published_at: projectionRow.published_at,
        } as Row,
      ],
    };
  }

  async first<Row>(): Promise<Row | null> {
    this.binding.executed.push({ sql: this.sql, params: this.params });
    if (this.sql.includes("target_slug")) {
      return { target_slug: "semogsite" } as Row;
    }
    if (this.params[0] === "missing") return null;
    return projectionRow as Row;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class FakeBinding implements D1DatabaseBinding {
  readonly executed: Array<{ sql: string; params: readonly unknown[] }> = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new FakeStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }
}

describe("D1PublishedEditorialReadModel", () => {
  it("returns the same public projection shape used by the SQLite reader", async () => {
    const binding = new FakeBinding();
    const model = new D1PublishedEditorialReadModel(binding);

    await expect(model.findBySlug("semogsite")).resolves.toEqual({
      kind: "project",
      slug: "semogsite",
      title: "SemogSite",
      excerpt: "Portfólio público com publicação editorial.",
      bodyMarkdown: "# SemogSite\n\nConteúdo público.",
      tags: ["typescript", "cloudflare"],
      contentHash: "a".repeat(64),
      publishedRevisionId: "revision-public-1",
      updatedAt: publishedAt,
    });

    expect(binding.executed[0]?.params).toEqual(["semogsite"]);
    expect(binding.executed[0]?.sql).toContain("publication_status = 'published'");
  });

  it("lists lightweight summaries filtered by editorial kind and bounded limit", async () => {
    const binding = new FakeBinding();
    const model = new D1PublishedEditorialReadModel(binding);

    await expect(
      model.listSummaries({ kind: "project", limit: 500 }),
    ).resolves.toEqual([
      {
        kind: "project",
        slug: "semogsite",
        title: "SemogSite",
        excerpt: "Portfólio público com publicação editorial.",
        tags: ["typescript", "cloudflare"],
        updatedAt: publishedAt,
      },
    ]);

    expect(binding.executed[0]?.params).toEqual(["project", 100]);
  });

  it("resolves aliases only through a published target of the same kind", async () => {
    const binding = new FakeBinding();
    const model = new D1PublishedEditorialReadModel(binding);

    await expect(model.resolveRedirect("site-antigo", "project")).resolves.toEqual({
      targetSlug: "semogsite",
    });
    expect(binding.executed[0]?.params).toEqual(["site-antigo", "project"]);
    expect(binding.executed[0]?.sql).toContain("target.publication_status = 'published'");
  });

  it("rejects malformed slugs without querying D1", async () => {
    const binding = new FakeBinding();
    const model = new D1PublishedEditorialReadModel(binding);

    await expect(model.findBySlug("../../private")).resolves.toBeNull();
    await expect(model.resolveRedirect("BAD SLUG", "project")).resolves.toBeNull();
    expect(binding.executed).toHaveLength(0);
  });
});
