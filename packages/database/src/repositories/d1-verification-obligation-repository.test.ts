import type {
  VerificationObligationAuditEvent,
  VerificationObligationSnapshot,
} from "@semogtw/domain/orchestration";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1VerificationObligationRepository } from "./d1-verification-obligation-repository";

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

const before: VerificationObligationSnapshot = {
  id: "verification-1",
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "cooperative-run-1",
  stageId: "stage-1",
  branch: "main",
  targetCommitSha: "a".repeat(40),
  gateName: "pnpm check",
  command: "pnpm check",
  requiredCapabilities: ["node", "pnpm"],
  responsibleActor: "ChatGPT",
  nextAction: "Executar no toolchain.",
  toolchainManifest: "semogsite",
  status: "pending",
  failureClassification: null,
  failureSignature: null,
  resultSummary: null,
  evidenceUrls: [],
  createdAt: "2026-08-09T20:00:00.000Z",
  lastAttemptAt: null,
  resolvedAt: null,
  version: 1,
};
const createAudit: VerificationObligationAuditEvent = {
  id: "verification-audit-1",
  actor: "semogtw-owner",
  action: "verification_obligation.create",
  entityType: "verification_obligation",
  entityId: before.id,
  before: null,
  after: before,
  reason: "Registrar gate externo.",
  occurredAt: before.createdAt,
  source: "agent",
  confirmed: false,
  idempotencyKey: "verification-create-1",
  correlationId: "verification-correlation-1",
};
const after: VerificationObligationSnapshot = {
  ...before,
  status: "passed",
  resultSummary: "Gate concluído com sucesso.",
  evidenceUrls: ["https://github.com/Semogtw/Offline-Toolchains/actions/runs/1"],
  lastAttemptAt: "2026-08-09T20:15:00.000Z",
  resolvedAt: "2026-08-09T20:15:00.000Z",
  nextAction: "Prosseguir.",
  version: 2,
};
const updateAudit: VerificationObligationAuditEvent = {
  id: "verification-audit-2",
  actor: "semogtw-owner",
  action: "verification_obligation.result",
  entityType: "verification_obligation",
  entityId: before.id,
  before,
  after,
  reason: after.resultSummary!,
  occurredAt: after.resolvedAt!,
  source: "agent",
  confirmed: false,
  idempotencyKey: "verification-result-1",
  correlationId: "verification-correlation-2",
};

function eventRow(audit: VerificationObligationAuditEvent) {
  return {
    id: audit.id,
    action: audit.action,
    actor: audit.actor,
    before_json: audit.before === null ? null : JSON.stringify(audit.before),
    after_json: JSON.stringify(audit.after),
    reason: audit.reason,
    source: audit.source,
    confirmed: audit.confirmed ? 1 : 0,
    correlation_id: audit.correlationId,
  };
}

describe("D1VerificationObligationRepository", () => {
  it("loads obligation JSON fields into the domain snapshot", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push({
      success: true,
      results: [{
        id: before.id,
        project_id: before.projectId,
        repository_id: before.repositoryId,
        run_id: before.runId,
        stage_id: before.stageId,
        branch: before.branch,
        target_commit_sha: before.targetCommitSha,
        gate_name: before.gateName,
        command: before.command,
        required_capabilities_json: JSON.stringify(before.requiredCapabilities),
        responsible_actor: before.responsibleActor,
        next_action: before.nextAction,
        toolchain_manifest: before.toolchainManifest,
        status: before.status,
        failure_classification: before.failureClassification,
        failure_signature: before.failureSignature,
        result_summary: before.resultSummary,
        evidence_urls_json: JSON.stringify(before.evidenceUrls),
        created_at: before.createdAt,
        last_attempt_at: before.lastAttemptAt,
        resolved_at: before.resolvedAt,
        version: before.version,
      }],
    });
    const repository = new D1VerificationObligationRepository(binding);

    await expect(repository.findById(before.id)).resolves.toEqual(before);
  });

  it("creates obligation, first event and audit in one guarded batch", async () => {
    const binding = new CapturingD1();
    const repository = new D1VerificationObligationRepository(binding);

    await expect(repository.create(before, createAudit)).resolves.toBe("created");
    const [insert, event, audit] = binding.batches[0] ?? [];
    expect(insert?.sql).toContain("EXISTS (SELECT 1 FROM repositories");
    expect(insert?.sql).toContain("EXISTS (SELECT 1 FROM cooperative_runs");
    expect(insert?.sql).toContain("EXISTS (SELECT 1 FROM stages");
    expect(event?.sql).toContain("SELECT ?, ?, 1");
    expect(event?.sql).toContain("WHERE changes() = 1");
    expect(audit?.sql).toContain("WHERE changes() = 1");
  });

  it("accepts only a semantically identical create replay as duplicate", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.allResponses.push({ success: true, results: [eventRow(createAudit)] });
    const repository = new D1VerificationObligationRepository(binding);
    await expect(repository.create(before, createAudit)).resolves.toBe("duplicate");

    const conflicting = new CapturingD1();
    conflicting.batchResults = binding.batchResults;
    conflicting.allResponses.push({
      success: true,
      results: [{ ...eventRow(createAudit), reason: "Outra intenção." }],
    });
    await expect(
      new D1VerificationObligationRepository(conflicting).create(before, createAudit),
    ).resolves.toBe("conflict");
  });

  it("classifies missing references after a zero-row create", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.allResponses.push(
      { success: true, results: [] },
      { success: true, results: [] },
    );
    const repository = new D1VerificationObligationRepository(binding);

    await expect(repository.create(before, createAudit)).resolves.toBe(
      "project_not_found",
    );
  });

  it("updates with version/status CAS and monotonic event sequencing", async () => {
    const binding = new CapturingD1();
    const repository = new D1VerificationObligationRepository(binding);

    await expect(repository.update(before, after, updateAudit)).resolves.toBe("updated");
    const [update, event, audit] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("WHERE id = ? AND version = ? AND status = ?");
    expect(update?.sql).toContain("idempotency_key = ?");
    expect(update?.params.slice(-5)).toEqual([
      before.id,
      before.version,
      before.status,
      after.id,
      updateAudit.idempotencyKey,
    ]);
    expect(event?.sql).toContain("MAX(sequence)");
    expect(event?.sql).toContain("WHERE changes() = 1");
    expect(audit?.sql).toContain("WHERE changes() = 1");
  });

  it("classifies exact update replay as duplicate and other CAS loss as conflict", async () => {
    const replay = new CapturingD1();
    replay.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    replay.allResponses.push({ success: true, results: [eventRow(updateAudit)] });
    await expect(
      new D1VerificationObligationRepository(replay).update(before, after, updateAudit),
    ).resolves.toBe("duplicate");

    const conflict = new CapturingD1();
    conflict.batchResults = replay.batchResults;
    conflict.allResponses.push({ success: true, results: [] });
    await expect(
      new D1VerificationObligationRepository(conflict).update(before, after, updateAudit),
    ).resolves.toBe("conflict");
  });

  it("fails closed when mutation change metadata is incomplete", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1VerificationObligationRepository(binding);

    await expect(repository.create(before, createAudit)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
