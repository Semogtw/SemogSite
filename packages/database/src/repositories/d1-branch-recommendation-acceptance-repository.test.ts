import type {
  BranchRecommendationAcceptanceAuditEvent,
  RepositoryBranchCandidate,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1BranchRecommendationAcceptanceRepository } from "./d1-branch-recommendation-acceptance-repository";

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
    return { results: [], success: true };
  }
  async first<Row>(): Promise<Row | null> {
    return (this.owner.firstResponses.shift() ?? null) as Row | null;
  }
  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }
  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class CapturingD1 implements D1DatabaseBinding {
  readonly firstResponses: unknown[] = [];
  readonly batches: Statement[][] = [];
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

const before: RepositoryBranchCandidate = {
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    activeBranch: "main",
    defaultBranch: "main",
    updatedAt: "2026-08-09T03:00:00.000Z",
  },
  recommendation: {
    id: "recommendation-2",
    status: "recommended",
    branch: "develop/cloudflare",
    confidence: "high",
    observedAt: "2026-08-09T03:30:00.000Z",
  },
};
const after: RepositoryBranchCandidate = {
  repository: {
    ...before.repository,
    activeBranch: "develop/cloudflare",
    updatedAt: "2026-08-09T04:00:00.000Z",
  },
  recommendation: before.recommendation,
};
const audit: BranchRecommendationAcceptanceAuditEvent = {
  id: "audit-branch-1",
  actor: "semogtw-owner",
  action: "repository.active_branch.accept",
  entityType: "repository",
  entityId: before.repository.id,
  before,
  after,
  reason: "Aceitar branch mais recente.",
  occurredAt: after.repository.updatedAt,
  source: "manual",
  confirmed: true,
  correlationId: "branch-correlation",
};

describe("D1BranchRecommendationAcceptanceRepository", () => {
  it("loads repository plus the latest branch recommendation", async () => {
    const binding = new CapturingD1();
    binding.firstResponses.push(
      {
        id: before.repository.id,
        full_name: before.repository.fullName,
        active_branch: before.repository.activeBranch,
        default_branch: before.repository.defaultBranch,
        updated_at: before.repository.updatedAt,
      },
      {
        id: before.recommendation?.id,
        status: before.recommendation?.status,
        branch: before.recommendation?.branch,
        confidence: before.recommendation?.confidence,
        observed_at: before.recommendation?.observedAt,
      },
    );
    const repository = new D1BranchRecommendationAcceptanceRepository(binding);

    await expect(repository.findCandidate(before.repository.id)).resolves.toEqual(before);
  });

  it("revalidates latest recommendation inside the CAS update and gates audit", async () => {
    const binding = new CapturingD1();
    const repository = new D1BranchRecommendationAcceptanceRepository(binding);

    await expect(repository.acceptWithAudit(before, after, audit)).resolves.toBe(true);
    const [update, auditInsert] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("AND updated_at = ?");
    expect(update?.sql).toContain("recommendation.status = 'recommended'");
    expect(update?.sql).toContain("recommendation.id = (");
    expect(update?.sql).toContain("ORDER BY latest_observation.observed_at DESC");
    expect(update?.params).toContain(before.recommendation?.id);
    expect(update?.params).toContain(after.repository.activeBranch);
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
  });

  it("returns false when the recommendation or repository changed concurrently", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    const repository = new D1BranchRecommendationAcceptanceRepository(binding);
    await expect(repository.acceptWithAudit(before, after, audit)).resolves.toBe(false);
  });

  it("rejects malformed before/after recommendation pairs without a write", async () => {
    const binding = new CapturingD1();
    const repository = new D1BranchRecommendationAcceptanceRepository(binding);
    await expect(
      repository.acceptWithAudit(
        { ...before, recommendation: null },
        after,
        audit,
      ),
    ).resolves.toBe(false);
    expect(binding.batches).toHaveLength(0);
  });

  it("fails closed when D1 omits changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1BranchRecommendationAcceptanceRepository(binding);
    await expect(repository.acceptWithAudit(before, after, audit)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
