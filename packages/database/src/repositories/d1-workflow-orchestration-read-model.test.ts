import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1WorkflowOrchestrationReadModel } from "./d1-workflow-orchestration-read-model";

class WorkflowStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: WorkflowBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new WorkflowStatement(this.database, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> { return { results: [] }; }
  async first<Row>(): Promise<Row | null> { return null; }
  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return this.database.rowsFor(this.sql) as unknown as readonly Row[];
  }
  async run(): Promise<D1QueryResult> { return { results: [], success: true }; }
}

class WorkflowBinding implements D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementBinding {
    return new WorkflowStatement(this, query);
  }
  async batch(): Promise<readonly D1QueryResult[]> { return []; }

  rowsFor(sql: string): readonly (readonly unknown[])[] {
    if (sql.includes('from "scope_reservations"')) {
      return [
        [
          "reservation-expired", null, "repo-a", "Semogtw/SemogSite", null,
          "main", "directory", '["apps/**"]', "agent-a", "Editar API", "active",
          "2026-08-07T20:00:00.000Z", "2026-08-07T20:30:00.000Z",
          "2026-08-07T21:00:00.000Z", null, 1,
        ],
        [
          "reservation-active", "project-a", "repo-a", "Semogtw/SemogSite", "run-a",
          "main", "files", '["apps/api/**","packages/database/**"]', "agent-b", "Portar Workflows", "active",
          "2026-08-07T21:00:00.000Z", "2026-08-07T21:50:00.000Z",
          "2026-08-07T23:00:00.000Z", null, 2,
        ],
      ];
    }
    if (sql.includes('from "verification_obligations"')) {
      return [
        [
          "obligation-passed", "project-a", "repo-a", "Semogtw/SemogSite", null, null,
          "main", "a".repeat(40), "typecheck", "pnpm typecheck", '["node"]', "agent-b",
          "Nada", null, "passed", null, null, "ok", '["https://example.com/evidence"]',
          "2026-08-07T21:00:00.000Z", "2026-08-07T21:10:00.000Z", "2026-08-07T21:10:00.000Z", 2,
        ],
        [
          "obligation-blocked", "project-a", "repo-a", "Semogtw/SemogSite", "run-a", "stage-a",
          "main", "b".repeat(40), "remote-d1", "wrangler d1 migrations apply", "{bad-json", "agent-b",
          "Retomar conector Cloudflare", "toolchains/semogsite.json", "blocked", "environment_missing",
          "connector-unavailable", "Cloudflare indisponível", "[]",
          "2026-08-07T22:00:00.000Z", "2026-08-07T22:05:00.000Z", null, 3,
        ],
      ];
    }
    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }
}

describe("D1WorkflowOrchestrationReadModel", () => {
  it("preserves freshness, sorting, summaries and conservative JSON parsing", async () => {
    const model = new D1WorkflowOrchestrationReadModel(
      createD1Database(new WorkflowBinding()),
    );

    await expect(
      model.getDashboard("2026-08-07T19:00:00-03:00"),
    ).resolves.toEqual({
      observedAt: "2026-08-07T22:00:00.000Z",
      summary: {
        activeReservations: 1,
        expiredReservations: 1,
        unresolvedObligations: 1,
        environmentBlockedObligations: 1,
      },
      reservations: [
        expect.objectContaining({
          id: "reservation-active",
          freshness: "active",
          patterns: ["apps/api/**", "packages/database/**"],
        }),
        expect.objectContaining({
          id: "reservation-expired",
          freshness: "expired",
          patterns: ["apps/**"],
        }),
      ],
      obligations: [
        expect.objectContaining({
          id: "obligation-blocked",
          status: "blocked",
          failureClassification: "environment_missing",
          requiredCapabilities: [],
        }),
        expect.objectContaining({
          id: "obligation-passed",
          status: "passed",
          requiredCapabilities: ["node"],
          evidenceUrls: ["https://example.com/evidence"],
        }),
      ],
    });
  });
});
