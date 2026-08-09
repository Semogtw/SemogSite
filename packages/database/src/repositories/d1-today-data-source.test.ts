import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1TodayDataSource } from "./d1-today-data-source";

type ExecutedQuery = {
  readonly sql: string;
  readonly params: readonly unknown[];
};

class TodayStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: TodayBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new TodayStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
  }

  async first<Row>(): Promise<Row | null> {
    return null;
  }

  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    this.database.queries.push({ sql: this.sql, params: this.params });
    return this.database.rowsFor(this.sql, this.params) as readonly Row[];
  }

  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class TodayBinding implements D1DatabaseBinding {
  readonly queries: ExecutedQuery[] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new TodayStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  rowsFor(
    sql: string,
    params: readonly unknown[],
  ): readonly (readonly unknown[])[] {
    if (sql.includes('from "stages"')) {
      const state = params[1];
      if (state === "in_progress") {
        return [[
          "stage-current",
          "project-a",
          "project-a",
          "Projeto A",
          "critical",
          "Integrar D1 Today",
          70,
          "Adapter em progresso",
          "Expor rota privada",
          "Dependência externa parcial",
          1,
          "2026-08-07T21:00:00.000Z",
        ]];
      }
      if (state === "next") {
        return [[
          "stage-next",
          "project-a",
          "project-a",
          "Projeto A",
          "critical",
          "Validar preview",
          0,
          "Aguardando etapa atual",
          "Executar smoke remoto",
          null,
          2,
          "2026-08-07T20:30:00.000Z",
        ]];
      }
    }
    if (sql.includes('from "evidence"')) {
      return params[0] === "stage-current"
        ? [["Typecheck D1", "passed", "2026-08-07T21:10:00.000Z"]]
        : [];
    }
    if (sql.includes('from "attention_items"')) {
      if (params.includes("external_environment")) {
        return [[
          "attention-external",
          "project-a",
          "Projeto A",
          "Cloudflare connector indisponível",
          "medium",
          "Retomar migration remota",
        ]];
      }
      return [[
        "attention-owner",
        null,
        null,
        "Revisar promoção",
        "high",
        "Confirmar preview",
      ]];
    }
    if (sql.includes('from "development_sessions"')) {
      return [[
        "session-a",
        "Sessão D1",
        "2026-08-07T21:20:00.000Z",
        "project-a",
      ]];
    }
    if (sql.includes('from "sync_runs"')) {
      return [["sync-a", "github", "2026-08-07T21:15:00.000Z"]];
    }
    throw new Error(`UNEXPECTED_SQL: ${sql} / ${JSON.stringify(params)}`);
  }
}

describe("D1TodayDataSource", () => {
  it("loads the complete Today projection through asynchronous D1 queries", async () => {
    const binding = new TodayBinding();
    const source = new D1TodayDataSource(createD1Database(binding));

    await expect(source.listCurrentWork()).resolves.toEqual([
      {
        stageId: "stage-current",
        projectId: "project-a",
        projectSlug: "project-a",
        projectName: "Projeto A",
        projectPriority: "critical",
        title: "Integrar D1 Today",
        progress: 70,
        currentPosition: "Adapter em progresso",
        nextStep: "Expor rota privada",
        partiallyBlocked: true,
        orderIndex: 1,
        updatedAt: "2026-08-07T21:00:00.000Z",
        latestEvidence: {
          title: "Typecheck D1",
          status: "passed",
          occurredAt: "2026-08-07T21:10:00.000Z",
        },
      },
    ]);
    await expect(source.listNextWork()).resolves.toMatchObject([
      {
        stageId: "stage-next",
        partiallyBlocked: false,
        latestEvidence: null,
      },
    ]);
    await expect(source.listOwnerAttention()).resolves.toEqual([
      {
        id: "attention-owner",
        projectId: null,
        projectName: null,
        title: "Revisar promoção",
        impact: "high",
        nextAction: "Confirmar preview",
      },
    ]);
    await expect(source.listExternalDependencies()).resolves.toEqual([
      {
        id: "attention-external",
        projectId: "project-a",
        projectName: "Projeto A",
        title: "Cloudflare connector indisponível",
        impact: "medium",
        nextAction: "Retomar migration remota",
      },
    ]);
    await expect(source.listRecentActivity()).resolves.toEqual([
      {
        id: "session-a",
        kind: "session",
        title: "Sessão D1",
        occurredAt: "2026-08-07T21:20:00.000Z",
        projectId: "project-a",
      },
      {
        id: "sync-a",
        kind: "sync",
        title: "Sincronização: github",
        occurredAt: "2026-08-07T21:15:00.000Z",
        projectId: null,
      },
    ]);

    expect(binding.queries.some((query) => query.params[1] === "in_progress")).toBe(true);
    expect(binding.queries.some((query) => query.params[1] === "next")).toBe(true);
    expect(binding.queries.some((query) => query.params.includes("external_environment"))).toBe(true);
  });
});
