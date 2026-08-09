import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1ProjectDataSource } from "./d1-project-data-source";

type Query = { readonly sql: string; readonly params: readonly unknown[] };

class ProjectStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: ProjectBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new ProjectStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    this.database.queries.push({ sql: this.sql, params: this.params });
    return this.database.rowsFor(this.sql, this.params) as unknown as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class ProjectBinding implements D1DatabaseBinding {
  readonly queries: Query[] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new ProjectStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  rowsFor(sql: string, params: readonly unknown[]): readonly (readonly unknown[])[] {
    if (sql.includes('from "projects"') && sql.includes('order by "projects"."name" asc')) {
      return [[
        "project-a", "project-a", "Projeto A", "active", "healthy", "high", 80,
        "Foco atual", "Próxima ação", "main", "high",
        "2026-08-07T20:00:00.000Z", "2026-08-07T21:00:00.000Z",
      ]];
    }
    if (sql.includes('from "repositories"') && sql.includes('order by "repositories"."full_name" asc') && params.length === 0) {
      return [[
        "repo-a", "project-a", "Semogtw/SemogSite", "product", "private", "active",
        "main", "codex/cloudflare-d1-foundation-2026-08-05",
        "https://github.com/Semogtw/SemogSite", "2026-08-07T21:00:00.000Z",
      ]];
    }
    if (sql.includes('from "projects"') && sql.includes('where "projects"."slug" = ?')) {
      return [[
        "project-a", "project-a", "Projeto A", null, "active", "healthy", "high", 80,
        "Foco atual", "Próxima ação", "main", "manual", "high", "private", null,
        "Resumo privado", null, 0, null, null, null, "2026-08-07T20:00:00.000Z",
        "2026-08-07T21:00:00.000Z", 0, "manual", "2026-08-07T19:00:00.000Z",
        "2026-08-07T21:00:00.000Z",
      ]];
    }
    if (sql.includes('from "repositories"') && params.includes("project-a")) {
      return [];
    }
    if (sql.includes('from "stages"') && params.includes("project-a")) {
      return [[
        "stage-a", "project-a", null, 1, "Integrar D1", "integration", "in_progress", 70,
        "Worker com leitura privada", "Portar Projects", "Expor Project Hub", null,
        "Testes verdes", 0, 0, "manual", "2026-08-07T19:30:00.000Z",
        "2026-08-07T21:05:00.000Z",
      ]];
    }
    if (sql.includes('from "attention_items"')) return [];
    if (sql.includes('from "evidence"')) return [];
    if (sql.includes('from "development_sessions"')) return [];
    if (sql.includes('from "workstreams"')) return [["Validar preview Cloudflare"]];
    throw new Error(`UNEXPECTED_SQL: ${sql} / ${JSON.stringify(params)}`);
  }
}

describe("D1ProjectDataSource", () => {
  it("loads the private portfolio and project hub through D1", async () => {
    const binding = new ProjectBinding();
    const source = new D1ProjectDataSource(createD1Database(binding));

    await expect(source.listProjects()).resolves.toEqual([
      {
        id: "project-a",
        slug: "project-a",
        name: "Projeto A",
        status: "active",
        health: "healthy",
        priority: "high",
        progressEstimate: 80,
        focus: "Foco atual",
        nextAction: "Próxima ação",
        branchSummary: "main",
        confidence: "high",
        lastActivityAt: "2026-08-07T20:00:00.000Z",
        lastSyncedAt: "2026-08-07T21:00:00.000Z",
      },
    ]);
    await expect(source.listRepositories()).resolves.toEqual([
      {
        id: "repo-a",
        projectId: "project-a",
        fullName: "Semogtw/SemogSite",
        role: "product",
        visibility: "private",
        status: "active",
        defaultBranch: "main",
        activeBranch: "codex/cloudflare-d1-foundation-2026-08-05",
        githubUrl: "https://github.com/Semogtw/SemogSite",
        lastSyncedAt: "2026-08-07T21:00:00.000Z",
      },
    ]);

    await expect(source.getProjectHub("project-a")).resolves.toMatchObject({
      project: { id: "project-a", slug: "project-a", priority: "high" },
      currentStages: [{ id: "stage-a", state: "in_progress" }],
      nextGate: "Validar preview Cloudflare",
      dataSource: "manual",
      updatedAt: "2026-08-07T21:00:00.000Z",
    });
    expect(binding.queries.some((query) => query.params.includes("project-a"))).toBe(true);
  });

  it("returns null for an unknown project slug", async () => {
    class MissingBinding extends ProjectBinding {
      override rowsFor(sql: string, params: readonly unknown[]) {
        if (sql.includes('from "projects"') && sql.includes('where "projects"."slug" = ?')) return [];
        return super.rowsFor(sql, params);
      }
    }
    const source = new D1ProjectDataSource(createD1Database(new MissingBinding()));
    await expect(source.getProjectHub("missing")).resolves.toBeNull();
  });
});
