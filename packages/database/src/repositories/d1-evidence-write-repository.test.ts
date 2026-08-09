import type {
  EvidenceAuditEvent,
  RecordedEvidence,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1EvidenceWriteRepository } from "./d1-evidence-write-repository";

class CapturedStatement implements D1PreparedStatementBinding {
  constructor(
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new CapturedStatement(this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    return { results: [] };
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
  batches: readonly D1PreparedStatementBinding[][] = [];
  failSecond = false;

  prepare(query: string): D1PreparedStatementBinding {
    return new CapturedStatement(query);
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches = [...this.batches, [...statements]];
    return statements.map((_, index) =>
      this.failSecond && index === 1
        ? { results: [], success: false, error: "constraint failed" }
        : { results: [], success: true },
    );
  }
}

const evidence: RecordedEvidence = {
  id: "evidence-d1-1",
  projectId: "project-1",
  stageId: "stage-1",
  sessionId: null,
  repositoryId: null,
  kind: "test",
  title: "CI completo",
  url: "https://github.com/Semogtw/Offline-Toolchains/actions/runs/1",
  externalId: "run-1",
  status: "passed",
  summary: "Gate completo passou.",
  occurredAt: "2026-08-09T02:45:00.000Z",
  capturedAt: "2026-08-09T02:45:00.000Z",
  sourceHash: null,
  source: "manual",
};

const audit: EvidenceAuditEvent = {
  id: "audit-evidence-d1-1",
  actor: "semogtw-owner",
  action: "evidence.create",
  entityType: "evidence",
  entityId: evidence.id,
  before: null,
  after: evidence,
  reason: "Registrar evidência verificada.",
  occurredAt: evidence.capturedAt,
  source: "manual",
  confirmed: true,
  correlationId: "correlation-evidence-d1-1",
};

describe("D1EvidenceWriteRepository", () => {
  it("submits evidence and audit together", async () => {
    const binding = new CapturingD1();
    const repository = new D1EvidenceWriteRepository(binding);

    await repository.insertEvidenceWithAudit(evidence, audit);

    expect(binding.batches).toHaveLength(1);
    const [recordStatement, auditStatement] = binding.batches[0] ?? [];
    const recordParams = (recordStatement as CapturedStatement).params;
    const auditParams = (auditStatement as CapturedStatement).params;

    expect(recordParams).toContain("evidence-d1-1");
    expect(recordParams).toContain("project-1");
    expect(recordParams).toContain("stage-1");
    expect(recordParams).toContain("passed");
    expect(auditParams).toContain("evidence.create");
    expect(auditParams).toContain("correlation-evidence-d1-1");
    expect(auditParams).toContain(JSON.stringify(evidence));
  });

  it("surfaces a failed D1 batch result", async () => {
    const binding = new CapturingD1();
    binding.failSecond = true;
    const repository = new D1EvidenceWriteRepository(binding);

    await expect(repository.insertEvidenceWithAudit(evidence, audit)).rejects.toThrow(
      "D1 evidence write batch failed",
    );
  });
});
