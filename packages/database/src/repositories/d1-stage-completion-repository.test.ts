import type {
  StageCompletionAuditEvent,
  StageSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1StageCompletionRepository } from "./d1-stage-completion-repository";

class CapturedStatement implements D1PreparedStatementBinding {
  constructor(
    readonly owner: CapturingD1,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new CapturedStatement(this.owner, this.sql, values);
  }

  async all<Row>(): Promise<D1QueryResult<Row>> {
    const response = this.owner.allResponses.shift() ?? {
      results: [],
      success: true,
    };
    return response as D1QueryResult<Row>;
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
  readonly prepared: CapturedStatement[] = [];
  readonly batches: CapturedStatement[][] = [];
  readonly allResponses: D1QueryResult[] = [];
  batchResults: readonly D1QueryResult[] = [
    { results: [], success: true, meta: { changes: 1 } },
    { results: [], success: true, meta: { changes: 1 } },
  ];

  prepare(query: string): D1PreparedStatementBinding {
    const statement = new CapturedStatement(this, query);
    this.prepared.push(statement);
    return statement;
  }

  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches.push(statements as CapturedStatement[]);
    return this.batchResults;
  }
}

const before: StageSnapshot = {
  id: "stage-1",
  projectId: "project-1",
  title: "Cloudflare production",
  state: "in_progress",
  progress: 90,
  done: false,
  nextStep: "Validar deploy.",
  blocker: null,
  evidence: [{ id: "evidence-1", status: "passed" }],
  manualLock: false,
  updatedAt: "2026-08-09T03:00:00.000Z",
};

const after: StageSnapshot = {
  ...before,
  state: "completed",
  progress: 100,
  done: true,
  nextStep: null,
  blocker: null,
  manualLock: true,
  updatedAt: "2026-08-09T03:30:00.000Z",
};

const audit: StageCompletionAuditEvent = {
  id: "audit-stage-1",
  actor: "semogtw-owner",
  action: "stage.complete",
  entityType: "stage",
  entityId: "stage-1",
  before,
  after,
  reason: "Gate de produção validado.",
  occurredAt: after.updatedAt,
  source: "manual",
  confirmed: true,
  correlationId: "correlation-stage-1",
};

describe("D1StageCompletionRepository", () => {
  it("loads the stage snapshot and its evidence", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push(
      {
        success: true,
        results: [
          {
            id: "stage-1",
            project_id: "project-1",
            title: "Cloudflare production",
            state: "in_progress",
            progress: 90,
            done: 0,
            next_step: "Validar deploy.",
            blocker: null,
            manual_lock: 0,
            updated_at: "2026-08-09T03:00:00.000Z",
          },
        ],
      },
      {
        success: true,
        results: [{ id: "evidence-1", status: "passed" }],
      },
    );
    const repository = new D1StageCompletionRepository(binding);

    await expect(repository.findById("stage-1")).resolves.toEqual(before);

    expect(binding.prepared[0]?.sql).toContain("FROM stages");
    expect(binding.prepared[1]?.sql).toContain("FROM evidence");
  });

  it("preserves CAS and only audits a successful transition", async () => {
    const binding = new CapturingD1();
    const repository = new D1StageCompletionRepository(binding);

    await expect(
      repository.completeWithAudit(before, after, audit),
    ).resolves.toBe(true);

    expect(binding.batches).toHaveLength(1);
    const [transition, auditInsert] = binding.batches[0] ?? [];
    expect(transition?.sql).toContain(
      "WHERE id = ? AND state = ? AND updated_at = ?",
    );
    expect(transition?.params.slice(-3)).toEqual([
      before.id,
      before.state,
      before.updatedAt,
    ]);
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
    expect(auditInsert?.params).toContain(JSON.stringify(before));
    expect(auditInsert?.params).toContain(JSON.stringify(after));
    expect(auditInsert?.params).toContain("correlation-stage-1");
  });

  it("returns conflict without treating a zero-row CAS as success", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    const repository = new D1StageCompletionRepository(binding);

    await expect(
      repository.completeWithAudit(before, after, audit),
    ).resolves.toBe(false);
  });

  it("fails closed when D1 omits CAS changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1StageCompletionRepository(binding);

    await expect(
      repository.completeWithAudit(before, after, audit),
    ).rejects.toThrow("missing changes metadata");
  });

  it("surfaces a failed statement so the transactional batch cannot be accepted", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 1 } },
      {
        results: [],
        success: false,
        error: "audit constraint failed",
        meta: { changes: 0 },
      },
    ];
    const repository = new D1StageCompletionRepository(binding);

    await expect(
      repository.completeWithAudit(before, after, audit),
    ).rejects.toThrow("D1 stage completion batch failed");
  });
});
