import type {
  RegisteredRepositorySyncTarget,
  RepositorySyncTargetRegistrationAuditEvent,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1RepositoryTargetRegistrationRepository } from "./d1-repository-target-registration-repository";

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
  readonly batches: Statement[][] = [];
  readonly firstResponses: unknown[] = [];
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

const target: RegisteredRepositorySyncTarget = {
  id: "repository-1",
  projectId: "project-1",
  githubNodeId: null,
  owner: "Semogtw",
  name: "SemogSite",
  fullName: "Semogtw/SemogSite",
  htmlUrl: "https://github.com/Semogtw/SemogSite",
  visibility: "private",
  defaultBranch: "main",
  activeBranch: null,
  role: "product",
  syncEnabled: true,
  status: "active",
  lastSyncedAt: null,
  dataSource: "manual",
  createdAt: "2026-08-09T04:00:00.000Z",
  updatedAt: "2026-08-09T04:00:00.000Z",
};
const audit: RepositorySyncTargetRegistrationAuditEvent = {
  id: "audit-repository-1",
  actor: "semogtw-owner",
  action: "repository.sync_target.create",
  entityType: "repository",
  entityId: target.id,
  before: null,
  after: target,
  reason: "Cadastrar alvo privado.",
  occurredAt: target.createdAt,
  source: "manual",
  confirmed: true,
  correlationId: "repository-registration-correlation",
};

describe("D1RepositoryTargetRegistrationRepository", () => {
  it("atomically inserts only for a valid project and unused identities", async () => {
    const binding = new CapturingD1();
    const repository = new D1RepositoryTargetRegistrationRepository(binding);

    await expect(repository.createWithAudit(target, audit)).resolves.toBe("created");
    const [insert, auditInsert] = binding.batches[0] ?? [];
    expect(insert?.sql).toContain("WHERE EXISTS");
    expect(insert?.sql).toContain("status <> 'archived'");
    expect(insert?.sql).toContain("lower(full_name) = lower(?)");
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
  });

  it("classifies a zero-row insert as project_not_found", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(null);
    const repository = new D1RepositoryTargetRegistrationRepository(binding);

    await expect(repository.createWithAudit(target, audit)).resolves.toBe(
      "project_not_found",
    );
  });

  it("classifies a final-state full-name collision as duplicate", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push({ id: target.projectId }, { id: "repository-other" });
    const repository = new D1RepositoryTargetRegistrationRepository(binding);

    await expect(repository.createWithAudit(target, audit)).resolves.toBe("duplicate");
  });

  it("returns conflict when project and full name remain available", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push({ id: target.projectId }, null);
    const repository = new D1RepositoryTargetRegistrationRepository(binding);

    await expect(repository.createWithAudit(target, audit)).resolves.toBe("conflict");
  });

  it("fails closed without trustworthy insert changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1RepositoryTargetRegistrationRepository(binding);

    await expect(repository.createWithAudit(target, audit)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
