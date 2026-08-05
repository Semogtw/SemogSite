import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1OverviewDataSource } from "./d1-overview-data-source";

class OverviewStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: OverviewBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new OverviewStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    this.database.queries.push({ sql: this.sql, params: this.params });
    return this.database.rowsFor(this.sql) as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class OverviewBinding implements D1DatabaseBinding {
  readonly queries: { sql: string; params: readonly unknown[] }[] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new OverviewStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  rowsFor(sql: string): readonly (readonly unknown[])[] {
    if (sql.includes('from "projects"')) {
      return [[
        "project-a",
        "project-a",
        "Projeto A",
        "high",
        "healthy",
        80,
        "Foco atual",
        "Próxima ação",
        "main",
        "2026-08-05T12:00:00.000Z",
        "2026-08-05T12:30:00.000Z",
      ]];
    }
    if (sql.includes('from "stages"')) {
      return [
        ["stage-a", "project-a", "Implementar D1", "in_progress", 60, 1],
        ["stage-b", "project-a", "Validar preview", "blocked", 20, 2],
      ];
    }
    if (sql.includes('from "attention_items"')) {
      return [[
        "attention-a",
        "project-a",
        "Configurar secrets",
        "high",
        "owner",
        "Criar secrets no preview",
      ]];
    }
    if (sql.includes('from "sync_runs"')) {
      return [["2026-08-05T12:30:00.000Z"]];
    }
    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }
}

describe("D1OverviewDataSource", () => {
  it("loads all private overview projections through asynchronous D1 queries", async () => {
    const binding = new OverviewBinding();
    const source = new D1OverviewDataSource(createD1Database(binding));

    await expect(source.listActiveProjects()).resolves.toEqual([
      {
        id: "project-a",
        slug: "project-a",
        name: "Projeto A",
        priority: "high",
        health: "healthy",
        progressEstimate: 80,
        focus: "Foco atual",
        nextAction: "Próxima ação",
        branchSummary: "main",
        lastActivityAt: "2026-08-05T12:00:00.000Z",
        lastSyncedAt: "2026-08-05T12:30:00.000Z",
      },
    ]);
    await expect(source.listCurrentStages()).resolves.toEqual([
      {
        id: "stage-a",
        projectId: "project-a",
        title: "Implementar D1",
        state: "in_progress",
        progress: 60,
        orderIndex: 1,
      },
      {
        id: "stage-b",
        projectId: "project-a",
        title: "Validar preview",
        state: "blocked",
        progress: 20,
        orderIndex: 2,
      },
    ]);
    await expect(source.listOpenAttention()).resolves.toEqual([
      {
        id: "attention-a",
        projectId: "project-a",
        title: "Configurar secrets",
        impact: "high",
        owner: "owner",
        nextAction: "Criar secrets no preview",
      },
    ]);
    await expect(source.getLastSuccessfulSyncAt()).resolves.toBe(
      "2026-08-05T12:30:00.000Z",
    );

    expect(binding.queries).toHaveLength(4);
    expect(binding.queries[0]?.params).toEqual(["active"]);
    expect(binding.queries[1]?.params).toEqual(["in_progress", "blocked"]);
    expect(binding.queries[2]?.params).toEqual(["open", "monitoring"]);
    expect(binding.queries[3]?.params).toEqual(["success", 1]);
  });
});
