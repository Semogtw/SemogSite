import type {
  AttentionLifecycleAuditEvent,
  AttentionLifecycleSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1AttentionLifecycleRepository } from "./d1-attention-lifecycle-repository";

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
    return (this.owner.allResponses.shift() ?? {
      results: [],
      success: true,
    }) as D1QueryResult<Row>;
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
  readonly prepared: Statement[] = [];
  readonly batches: Statement[][] = [];
  readonly allResponses: D1QueryResult[] = [];
  batchResults: readonly D1QueryResult[] = [
    { results: [], success: true, meta: { changes: 1 } },
    { results: [], success: true, meta: { changes: 1 } },
  ];

  prepare(query: string): D1PreparedStatementBinding {
    const statement = new Statement(this, query);
    this.prepared.push(statement);
    return statement;
  }
  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches.push(statements as Statement[]);
    return this.batchResults;
  }
}

const before: AttentionLifecycleSnapshot = {
  id: "attention-1",
  projectId: "project-1",
  type: "critical_test",
  status: "open",
  impact: "high",
  title: "Validar runtime real",
  owner: "external_environment",
  nextAction: "Rodar gate fora do sandbox.",
  source: "manual",
  resolvedAt: null,
  createdAt: "2026-08-09T03:00:00.000Z",
  updatedAt: "2026-08-09T03:00:00.000Z",
};
const after: AttentionLifecycleSnapshot = {
  ...before,
  status: "resolved",
  resolvedAt: "2026-08-09T04:00:00.000Z",
  updatedAt: "2026-08-09T04:00:00.000Z",
};
const audit: AttentionLifecycleAuditEvent = {
  id: "audit-attention-1",
  actor: "semogtw-owner",
  action: "attention.resolve",
  entityType: "attention_item",
  entityId: before.id,
  before,
  after,
  reason: "Gate validado.",
  occurredAt: after.updatedAt,
  source: "manual",
  confirmed: true,
  correlationId: "attention-correlation-1",
};

describe("D1AttentionLifecycleRepository", () => {
  it("loads persisted local_test as the domain critical_test type", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push({
      success: true,
      results: [{
        id: "attention-1",
        project_id: "project-1",
        type: "local_test",
        status: "open",
        impact: "high",
        title: "Validar runtime real",
        owner: "external_environment",
        next_action: "Rodar gate fora do sandbox.",
        data_source: "manual",
        resolved_at: null,
        created_at: before.createdAt,
        updated_at: before.updatedAt,
      }],
    });
    const repository = new D1AttentionLifecycleRepository(binding);

    await expect(repository.findById("attention-1")).resolves.toEqual(before);
  });

  it("preserves id/status/updated_at CAS and conditionally audits it", async () => {
    const binding = new CapturingD1();
    const repository = new D1AttentionLifecycleRepository(binding);

    await expect(repository.transitionWithAudit(before, after, audit)).resolves.toBe(true);

    const [transition, auditInsert] = binding.batches[0] ?? [];
    expect(transition?.sql).toContain(
      "WHERE id = ? AND status = ? AND updated_at = ?",
    );
    expect(transition?.params).toContain("local_test");
    expect(transition?.params.slice(-3)).toEqual([
      before.id,
      before.status,
      before.updatedAt,
    ]);
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
    expect(auditInsert?.params).toContain(JSON.stringify(before));
    expect(auditInsert?.params).toContain(JSON.stringify(after));
  });

  it("returns false for a lost optimistic race", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    const repository = new D1AttentionLifecycleRepository(binding);

    await expect(repository.transitionWithAudit(before, after, audit)).resolves.toBe(false);
  });

  it("fails closed without trustworthy changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1AttentionLifecycleRepository(binding);

    await expect(repository.transitionWithAudit(before, after, audit)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
