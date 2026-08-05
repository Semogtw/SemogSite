import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1PublicProjectSource } from "./d1-public-project-source";

type ProjectFixture = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly visibility: "private" | "unlisted" | "public";
  readonly publicSummary: string | null;
};

type ExecutedQuery = {
  readonly sql: string;
  readonly params: readonly unknown[];
};

const fixtures: readonly ProjectFixture[] = [
  {
    id: "public-project",
    slug: "public-project",
    name: "Projeto público",
    visibility: "public",
    publicSummary: "Resumo público.",
  },
  {
    id: "unlisted-project",
    slug: "unlisted-project",
    name: "Projeto não listado",
    visibility: "unlisted",
    publicSummary: "Resumo não listado.",
  },
  {
    id: "private-project",
    slug: "private-project",
    name: "Projeto privado",
    visibility: "private",
    publicSummary: "Não deve ser publicado.",
  },
  {
    id: "missing-summary",
    slug: "missing-summary",
    name: "Sem resumo",
    visibility: "public",
    publicSummary: null,
  },
];

function projectValues(project: ProjectFixture): readonly unknown[] {
  return [
    project.id,
    project.slug,
    project.name,
    null,
    "active",
    "healthy",
    "high",
    80,
    "PRIVATE_FOCUS",
    "PRIVATE_NEXT_ACTION",
    "private/branch",
    "PRIVATE_STATUS_BASIS",
    "high",
    project.visibility,
    project.publicSummary,
    "PRIVATE_SUMMARY",
    75,
    1,
    null,
    "https://example.com",
    null,
    "2026-08-01T12:00:00.000Z",
    null,
    0,
    "manual",
    "2026-08-01T12:00:00.000Z",
    "2026-08-01T12:00:00.000Z",
  ];
}

class FakeD1PreparedStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: FakeD1Binding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new FakeD1PreparedStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    this.database.executed.push({ sql: this.sql, params: this.params });
    return this.database.resolveRows(this.params) as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class FakeD1Binding implements D1DatabaseBinding {
  readonly executed: ExecutedQuery[] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new FakeD1PreparedStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  resolveRows(params: readonly unknown[]): readonly (readonly unknown[])[] {
    const slug = params.length > 1 ? params[0] : null;
    return fixtures
      .filter((project) => {
        if (project.publicSummary === null) return false;
        if (slug === null) return project.visibility === "public";
        return (
          project.slug === slug &&
          (project.visibility === "public" || project.visibility === "unlisted")
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(projectValues);
  }
}

describe("D1PublicProjectSource", () => {
  it("lists only public projects with an approved public summary", async () => {
    const binding = new FakeD1Binding();
    const database = createD1Database(binding);
    const source = new D1PublicProjectSource(database);

    await expect(source.listListed()).resolves.toMatchObject([
      {
        slug: "public-project",
        visibility: "public",
        publicSummary: "Resumo público.",
        featured: true,
        privateSummary: "PRIVATE_SUMMARY",
        branchSummary: "private/branch",
      },
    ]);
    expect(binding.executed).toHaveLength(1);
    expect(binding.executed[0]?.sql).toContain('"visibility" = ?');
    expect(binding.executed[0]?.sql).toContain('"public_summary" is not null');
    expect(binding.executed[0]?.params).toEqual(["public"]);
  });

  it("allows direct public and unlisted lookups while rejecting private rows", async () => {
    const binding = new FakeD1Binding();
    const source = new D1PublicProjectSource(createD1Database(binding));

    await expect(
      source.findPublishableBySlug("unlisted-project"),
    ).resolves.toMatchObject({
      slug: "unlisted-project",
      visibility: "unlisted",
    });
    await expect(
      source.findPublishableBySlug("private-project"),
    ).resolves.toBeNull();

    expect(binding.executed[0]?.params).toEqual([
      "unlisted-project",
      "public",
      "unlisted",
    ]);
    expect(binding.executed[1]?.params).toEqual([
      "private-project",
      "public",
      "unlisted",
    ]);
  });

  it("retains the exact Worker binding on the Drizzle composition", () => {
    const binding = new FakeD1Binding();
    expect(createD1Database(binding).$client).toBe(binding);
  });
});
