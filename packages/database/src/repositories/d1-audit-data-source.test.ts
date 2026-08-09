import { describe, expect, it } from "vitest";
import {
  createD1Database,
  type D1DatabaseBinding,
  type D1PreparedStatementBinding,
  type D1QueryResult,
} from "../adapters/d1";
import { D1AuditDataSource } from "./d1-audit-data-source";

type Query = { readonly sql: string; readonly params: readonly unknown[] };

class AuditStatement implements D1PreparedStatementBinding {
  constructor(
    private readonly database: AuditBinding,
    private readonly sql: string,
    private readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new AuditStatement(this.database, this.sql, values);
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

class AuditBinding implements D1DatabaseBinding {
  readonly queries: Query[] = [];

  prepare(query: string): D1PreparedStatementBinding {
    return new AuditStatement(this, query);
  }

  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }

  rowsFor(sql: string, params: readonly unknown[]): readonly (readonly unknown[])[] {
    if (sql.includes("count(")) return [[3]];
    if (sql.includes('from "audit_events"')) {
      return [[
        "audit-3",
        "owner",
        "evidence.create",
        "evidence",
        "evidence-3",
        "{bad-json",
        '{"status":"passed"}',
        "Confirmação manual",
        "2026-08-07T22:30:00.000Z",
        "devos",
        true,
        "corr-3",
      ]];
    }
    throw new Error(`UNEXPECTED_SQL: ${sql} / ${JSON.stringify(params)}`);
  }
}

describe("D1AuditDataSource", () => {
  it("preserves SQLite-compatible filtering, pagination and malformed JSON handling", async () => {
    const binding = new AuditBinding();
    const source = new D1AuditDataSource(createD1Database(binding));

    await expect(
      source.list({
        page: 2,
        pageSize: 1,
        action: "  evidence.create  ",
        entityType: " evidence ",
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "audit-3",
          actor: "owner",
          action: "evidence.create",
          entityType: "evidence",
          entityId: "evidence-3",
          before: null,
          after: { status: "passed" },
          reason: "Confirmação manual",
          occurredAt: "2026-08-07T22:30:00.000Z",
          source: "devos",
          confirmed: true,
          correlationId: "corr-3",
          malformedJson: ["before"],
        },
      ],
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });

    expect(binding.queries).toHaveLength(2);
    expect(binding.queries[0]?.params).toEqual(["evidence.create", "evidence"]);
    expect(binding.queries[1]?.params).toEqual([
      "evidence.create",
      "evidence",
      1,
      1,
    ]);
    expect(binding.queries[1]?.sql).toContain('order by "audit_events"."occurred_at" desc');
    expect(binding.queries[1]?.sql).toContain('"audit_events"."id" desc');
  });
});
