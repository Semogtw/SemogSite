import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1RoadmapDataSource } from "./d1-roadmap-data-source";

type ExecutedQuery = {
  readonly sql: string;
  readonly params: readonly unknown[];
};

class RoadmapStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: RoadmapBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new RoadmapStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    this.database.queries.push({ sql: this.sql, params: this.params });
    return this.database.rows as unknown as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class RoadmapBinding implements D1DatabaseBinding {
  readonly queries: ExecutedQuery[] = [];
  readonly rows = [
    [
      "stage-a",
      "project-a",
      "Projeto A",
      "Integrar Roadmap D1",
      "integration",
      "in_progress",
      75,
      2,
      "Adapter em progresso",
      "Expor rota privada",
      null,
      "2026-08-07T22:00:00.000Z",
    ],
    [
      "stage-b",
      "project-b",
      "Projeto B",
      "Validar preview",
      "validation",
      "next",
      0,
      1,
      "Aguardando integração",
      "Executar smoke",
      "Dependência externa",
      "2026-08-07T21:30:00.000Z",
    ],
  ] as const;

  prepare(query: string): D1PreparedStatementBinding {
    return new RoadmapStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }
}

describe("D1RoadmapDataSource", () => {
  it("reads the canonical roadmap projection in stable project/stage order", async () => {
    const binding = new RoadmapBinding();
    const source = new D1RoadmapDataSource(createD1Database(binding));

    await expect(source.listRoadmapItems()).resolves.toEqual([
      {
        id: "stage-a",
        projectId: "project-a",
        projectName: "Projeto A",
        title: "Integrar Roadmap D1",
        area: "integration",
        state: "in_progress",
        progress: 75,
        orderIndex: 2,
        currentPosition: "Adapter em progresso",
        nextStep: "Expor rota privada",
        blocker: null,
        updatedAt: "2026-08-07T22:00:00.000Z",
      },
      {
        id: "stage-b",
        projectId: "project-b",
        projectName: "Projeto B",
        title: "Validar preview",
        area: "validation",
        state: "next",
        progress: 0,
        orderIndex: 1,
        currentPosition: "Aguardando integração",
        nextStep: "Executar smoke",
        blocker: "Dependência externa",
        updatedAt: "2026-08-07T21:30:00.000Z",
      },
    ]);

    expect(binding.queries).toHaveLength(1);
    expect(binding.queries[0]?.params).toEqual([]);
    expect(binding.queries[0]?.sql).toContain('order by "projects"."name" asc');
    expect(binding.queries[0]?.sql).toContain('"stages"."order_index" asc');
  });
});
