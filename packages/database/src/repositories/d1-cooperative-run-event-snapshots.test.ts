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

describe("D1 cooperative run event snapshot minimization", () => {
  it("does not read persisted snapshots by default", async () => {
    const binding = new CapturingD1();
    const model = new D1CooperativeRunReadModel(binding);

    await model.listEvents("cooperative-run-1", { limit: 25 });

    const query = binding.executed[0];
    expect(query?.sql).not.toContain("before_json");
    expect(query?.sql).not.toContain("after_json");
    expect(query?.params).toEqual(["cooperative-run-1", 25]);
  });

  it("loads persisted snapshots only after explicit opt-in", async () => {
    const binding = new CapturingD1();
    const model = new D1CooperativeRunReadModel(binding);

    await model.listEvents("cooperative-run-1", {
      limit: 25,
      includeSnapshots: true,
    });

    const query = binding.executed[0];
    expect(query?.sql).toContain("before_json, after_json");
    expect(query?.sql).not.toContain("NULL AS before_json");
    expect(query?.sql).not.toContain("NULL AS after_json");
    expect(query?.params).toEqual(["cooperative-run-1", 25]);
  });
});
