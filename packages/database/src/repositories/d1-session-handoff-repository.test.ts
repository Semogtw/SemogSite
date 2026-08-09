import type {
  RecordedDevelopmentSession,
  SessionHandoffAuditEvent,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1SessionHandoffRepository } from "./d1-session-handoff-repository";

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

const session: RecordedDevelopmentSession = {
  id: "session-d1-1",
  projectId: "project-1",
  title: "Cloudflare private writes",
  sessionDate: "2026-08-09T03:00:00.000Z",
  actor: "semogtw-owner",
  branch: "main",
  commits: ["abcdef1", "1234567890abcdef"],
  completedSummary: "Portamos writes append-only para D1.",
  testsStatus: "passed",
  testsSummary: "CI centralizado verde.",
  blockers: "Lifecycle concorrente ainda não portado.",
  nextStep: "Provar semântica CAS no D1.",
  result: "significant",
  sourceUrl: null,
  automatic: false,
  sourceHash: null,
  source: "manual",
  createdAt: "2026-08-09T03:00:00.000Z",
  updatedAt: "2026-08-09T03:00:00.000Z",
};

const audit: SessionHandoffAuditEvent = {
  id: "audit-session-d1-1",
  actor: "semogtw-owner",
  action: "development_session.create",
  entityType: "development_session",
  entityId: session.id,
  before: null,
  after: session,
  reason: "Registrar handoff verificável.",
  occurredAt: session.createdAt,
  source: "manual",
  confirmed: true,
  correlationId: "correlation-session-d1-1",
};

describe("D1SessionHandoffRepository", () => {
  it("submits session and audit in one batch", async () => {
    const binding = new CapturingD1();
    const repository = new D1SessionHandoffRepository(binding);

    await repository.insertSessionWithAudit(session, audit);

    expect(binding.batches).toHaveLength(1);
    const [sessionStatement, auditStatement] = binding.batches[0] ?? [];
    const sessionParams = (sessionStatement as CapturedStatement).params;
    const auditParams = (auditStatement as CapturedStatement).params;

    expect(sessionParams).toContain("session-d1-1");
    expect(sessionParams).toContain(JSON.stringify(session.commits));
    expect(sessionParams).toContain("passed");
    expect(sessionParams).toContain(0);
    expect(auditParams).toContain("development_session.create");
    expect(auditParams).toContain("correlation-session-d1-1");
    expect(auditParams).toContain(JSON.stringify(session));
  });

  it("surfaces failed D1 batch results", async () => {
    const binding = new CapturingD1();
    binding.failSecond = true;
    const repository = new D1SessionHandoffRepository(binding);

    await expect(repository.insertSessionWithAudit(session, audit)).rejects.toThrow(
      "D1 session handoff batch failed",
    );
  });
});
