import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunReadModel } from "./d1-cooperative-run-read-model";

class Statement implements D1PreparedStatementBinding {
  constructor(
    readonly owner: CapturingD1,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}
  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new Statement(this.owner, this.sql, values);
  }
  async all<Row>(): Promise<D1QueryResult<Row>> {
    this.owner.executed.push(this);
    return { results: [], success: true };
  }
  async first<Row>(): Promise<Row | null> {
    return null;
  }
  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }
  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class CapturingD1 implements D1DatabaseBinding {
  readonly executed: Statement[] = [];
  prepare(query: string): D1PreparedStatementBinding {
    return new Statement(this, query);
  }
  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }
}

describe("D1 cooperative run keyset pagination", () => {
  it("binds cursor values after project/status filters and before limit", async () => {
    const binding = new CapturingD1();
    const model = new D1CooperativeRunReadModel(binding);

    await model.listRecent({
      limit: 20,
      projectId: "project-1",
      status: "running",
      cursor: {
        updatedAt: "2026-08-09T04:45:00.000Z",
        id: "cooperative-run-page-3",
      },
    });

    const query = binding.executed[0];
    expect(query?.sql).toContain(
      "(updated_at < ? OR (updated_at = ? AND id < ?))",
    );
    expect(query?.sql).toContain("ORDER BY updated_at DESC, id DESC");
    expect(query?.params).toEqual([
      "project-1",
      "running",
      "2026-08-09T04:45:00.000Z",
      "2026-08-09T04:45:00.000Z",
      "cooperative-run-page-3",
      20,
    ]);
    expect(query?.sql).not.toContain("cooperative-run-page-3");
  });
});
