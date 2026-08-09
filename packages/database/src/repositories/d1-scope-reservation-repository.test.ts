import type {
  ScopeReservationAuditEvent,
  ScopeReservationSnapshot,
} from "@semogtw/domain/orchestration";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1ScopeReservationRepository } from "./d1-scope-reservation-repository";

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

const before: ScopeReservationSnapshot = {
  id: "scope-reservation-1",
  projectId: "project-1",
  repositoryId: "repository-1",
  runId: "cooperative-run-1",
  branch: "main",
  kind: "directory",
  patterns: ["apps/api/**"],
  holderLabel: "ChatGPT",
  purpose: "Portar writes D1.",
  state: "active",
  acquiredAt: "2026-08-09T20:00:00.000Z",
  renewedAt: "2026-08-09T20:00:00.000Z",
  expiresAt: "2026-08-09T20:30:00.000Z",
  releasedAt: null,
  version: 1,
};
const acquireAudit: ScopeReservationAuditEvent = {
  id: "scope-audit-1",
  actor: "semogtw-owner",
  action: "scope_reservation.acquire",
  entityType: "scope_reservation",
  entityId: before.id,
  before: null,
  after: before,
  reason: before.purpose,
  overlapReservationIds: [],
  occurredAt: before.acquiredAt,
  source: "agent",
  confirmed: false,
  idempotencyKey: "scope-acquire-1",
  correlationId: "scope-correlation-1",
};
const after: ScopeReservationSnapshot = {
  ...before,
  renewedAt: "2026-08-09T20:10:00.000Z",
  expiresAt: "2026-08-09T20:40:00.000Z",
  version: 2,
};
const updateAudit: ScopeReservationAuditEvent = {
  id: "scope-audit-2",
  actor: "semogtw-owner",
  action: "scope_reservation.renew",
  entityType: "scope_reservation",
  entityId: before.id,
  before,
  after,
  reason: "Renew active scope reservation.",
  overlapReservationIds: [],
  occurredAt: after.renewedAt,
  source: "agent",
  confirmed: false,
  idempotencyKey: "scope-renew-1",
  correlationId: "scope-correlation-2",
};

function row(snapshot: ScopeReservationSnapshot) {
  return {
    id: snapshot.id,
    project_id: snapshot.projectId,
    repository_id: snapshot.repositoryId,
    run_id: snapshot.runId,
    branch: snapshot.branch,
    kind: snapshot.kind,
    patterns_json: JSON.stringify(snapshot.patterns),
    holder_label: snapshot.holderLabel,
    purpose: snapshot.purpose,
    state: snapshot.state,
    acquired_at: snapshot.acquiredAt,
    renewed_at: snapshot.renewedAt,
    expires_at: snapshot.expiresAt,
    released_at: snapshot.releasedAt,
    version: snapshot.version,
  };
}

function eventRow(audit: ScopeReservationAuditEvent) {
  return {
    id: audit.id,
    action: audit.action,
    actor: audit.actor,
    before_json: audit.before === null ? null : JSON.stringify(audit.before),
    after_json: JSON.stringify(audit.after),
    reason: audit.reason,
    overlap_ids_json: JSON.stringify(audit.overlapReservationIds),
    occurred_at: audit.occurredAt,
    source: audit.source,
    confirmed: audit.confirmed ? 1 : 0,
    correlation_id: audit.correlationId,
  };
}

describe("D1ScopeReservationRepository", () => {
  it("loads active overlap candidates and individual reservations", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push(
      { success: true, results: [row(before)] },
      { success: true, results: [row(before)] },
    );
    const repository = new D1ScopeReservationRepository(binding);

    await expect(
      repository.listPotentialOverlaps(
        before.repositoryId,
        before.branch,
        "2026-08-09T20:05:00.000Z",
      ),
    ).resolves.toEqual([before]);
    await expect(repository.findById(before.id)).resolves.toEqual(before);
  });

  it("acquires against an active repository and appends event plus audit atomically", async () => {
    const binding = new CapturingD1();
    const repository = new D1ScopeReservationRepository(binding);

    await expect(repository.acquire(before, acquireAudit)).resolves.toBe("created");
    const [insert, event, audit] = binding.batches[0] ?? [];
    expect(insert?.sql).toContain("status = 'active'");
    expect(insert?.sql).toContain("cooperative_runs");
    expect(insert?.sql).toContain("idempotency_key = ?");
    expect(event?.sql).toContain("SELECT ?, ?, ?,");
    expect(event?.sql).toContain("WHERE changes() = 1");
    expect(audit?.sql).toContain("WHERE changes() = 1");
  });

  it("accepts only the same acquire intent as an idempotent duplicate", async () => {
    const replay = new CapturingD1();
    replay.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    replay.allResponses.push({ success: true, results: [eventRow(acquireAudit)] });
    await expect(
      new D1ScopeReservationRepository(replay).acquire(before, acquireAudit),
    ).resolves.toBe("duplicate");

    const conflict = new CapturingD1();
    conflict.batchResults = replay.batchResults;
    conflict.allResponses.push({
      success: true,
      results: [{ ...eventRow(acquireAudit), reason: "Outra intenção." }],
    });
    await expect(
      new D1ScopeReservationRepository(conflict).acquire(before, acquireAudit),
    ).resolves.toBe("conflict");
  });

  it("classifies missing active repository and missing run after a zero-row acquire", async () => {
    const missingRepository = new CapturingD1();
    missingRepository.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    missingRepository.allResponses.push(
      { success: true, results: [] },
      { success: true, results: [] },
    );
    await expect(
      new D1ScopeReservationRepository(missingRepository).acquire(before, acquireAudit),
    ).resolves.toBe("repository_not_found");

    const missingRun = new CapturingD1();
    missingRun.batchResults = missingRepository.batchResults;
    missingRun.allResponses.push(
      { success: true, results: [] },
      { success: true, results: [{ id: before.repositoryId }] },
      { success: true, results: [] },
    );
    await expect(
      new D1ScopeReservationRepository(missingRun).acquire(before, acquireAudit),
    ).resolves.toBe("run_not_found");
  });

  it("updates with the full SQLite CAS and monotonic event sequence", async () => {
    const binding = new CapturingD1();
    const repository = new D1ScopeReservationRepository(binding);

    await expect(repository.update(before, after, updateAudit)).resolves.toBe("updated");
    const [update, event, audit] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("AND version = ?");
    expect(update?.sql).toContain("AND state = ?");
    expect(update?.sql).toContain("AND renewed_at = ?");
    expect(update?.sql).toContain("AND expires_at = ?");
    expect(update?.sql).toContain("AND released_at IS ?");
    expect(update?.params.slice(-8)).toEqual([
      before.id,
      before.version,
      before.state,
      before.renewedAt,
      before.expiresAt,
      before.releasedAt,
      after.id,
      updateAudit.idempotencyKey,
    ]);
    expect(event?.sql).toContain("MAX(sequence)");
    expect(event?.sql).toContain("WHERE changes() = 1");
    expect(audit?.sql).toContain("WHERE changes() = 1");
  });

  it("maps exact update replay to duplicate and other CAS loss to conflict", async () => {
    const replay = new CapturingD1();
    replay.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    replay.allResponses.push({ success: true, results: [eventRow(updateAudit)] });
    await expect(
      new D1ScopeReservationRepository(replay).update(before, after, updateAudit),
    ).resolves.toBe("duplicate");

    const conflict = new CapturingD1();
    conflict.batchResults = replay.batchResults;
    conflict.allResponses.push({ success: true, results: [] });
    await expect(
      new D1ScopeReservationRepository(conflict).update(before, after, updateAudit),
    ).resolves.toBe("conflict");
  });

  it("fails closed when D1 does not report trustworthy changes", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
      { results: [], success: true },
    ];
    await expect(
      new D1ScopeReservationRepository(binding).acquire(before, acquireAudit),
    ).rejects.toThrow("missing changes metadata");
  });
});
