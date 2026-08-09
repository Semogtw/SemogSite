import type {
  RepositorySyncTargetLifecycleAuditEvent,
  RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1RepositoryTargetLifecycleRepository } from "./d1-repository-target-lifecycle-repository";

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
  readonly batches: Statement[][] = [];
  readonly allResponses: D1QueryResult[] = [];
  batchResults: readonly D1QueryResult[] = [
    { results: [], success: true, meta: { changes: 1 } },
    { results: [], success: true, meta: { changes: 1 } },
  ];
  prepare(query: string): D1PreparedStatementBinding {
    return new Statement(this, query);
  }
  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches.push(statements as Statement[]);
    return this.batchResults;
  }
}

const before: RepositorySyncTargetLifecycleSnapshot = {
  id: "repository-1",
  fullName: "Semogtw/SemogSite",
  syncEnabled: true,
  updatedAt: "2026-08-09T03:00:00.000Z",
};
const after = {
  ...before,
  syncEnabled: false,
  updatedAt: "2026-08-09T04:00:00.000Z",
};
const audit: RepositorySyncTargetLifecycleAuditEvent = {
  id: "audit-repository-target-1",
  actor: "semogtw-owner",
  action: "repository.sync_target.disable",
  entityType: "repository",
  entityId: before.id,
  before,
  after,
  reason: "Pausar integração durante manutenção.",
  occurredAt: after.updatedAt,
  source: "manual",
  confirmed: true,
  correlationId: "repository-target-correlation-1",
};

describe("D1RepositoryTargetLifecycleRepository", () => {
  it("loads active repository target state", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push({
      success: true,
      results: [{
        id: before.id,
        full_name: before.fullName,
        sync_enabled: 1,
        updated_at: before.updatedAt,
      }],
    });
    const repository = new D1RepositoryTargetLifecycleRepository(binding);
    await expect(repository.findTarget(before.id)).resolves.toEqual(before);
  });

  it("preserves sync state and timestamp CAS and gates its audit", async () => {
    const binding = new CapturingD1();
    const repository = new D1RepositoryTargetLifecycleRepository(binding);
    await expect(repository.changeWithAudit(before, after, audit)).resolves.toBe(true);

    const [transition, auditInsert] = binding.batches[0] ?? [];
    expect(transition?.sql).toContain("AND sync_enabled = ?");
    expect(transition?.sql).toContain("AND updated_at = ?");
    expect(transition?.params.slice(-3)).toEqual([
      before.id,
      1,
      before.updatedAt,
    ]);
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
  });

  it("returns false when the observed state lost its race", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    const repository = new D1RepositoryTargetLifecycleRepository(binding);
    await expect(repository.changeWithAudit(before, after, audit)).resolves.toBe(false);
  });

  it("fails closed when D1 omits change metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1RepositoryTargetLifecycleRepository(binding);
    await expect(repository.changeWithAudit(before, after, audit)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
