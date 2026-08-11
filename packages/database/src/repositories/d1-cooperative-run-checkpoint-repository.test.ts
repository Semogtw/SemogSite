import type {
  CooperativeRunCheckpoint,
  CooperativeRunCheckpointEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunCheckpointRepository } from "./d1-cooperative-run-checkpoint-repository";

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
  readonly allResponses: D1QueryResult[] = [];
  readonly firstResponses: unknown[] = [];
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

const current: CooperativeRunSnapshot = {
  id: "run-checkpoint-d1",
  projectId: "project-1",
  title: "Checkpoint D1",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "implementation",
  progress: 40,
  branch: "main",
  summary: "Implementando adapter.",
  blocker: null,
  nextAction: "Registrar checkpoint.",
  startedAt: "2026-08-11T09:00:00.000Z",
  lastHeartbeatAt: "2026-08-11T09:10:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-11T09:10:00.000Z",
};
const next: CooperativeRunSnapshot = {
  ...current,
  progress: 60,
  summary: "Adapter implementado.",
  nextAction: "Expor API privada.",
  lastHeartbeatAt: "2026-08-11T09:20:00.000Z",
  updatedAt: "2026-08-11T09:20:00.000Z",
};
const event: CooperativeRunCheckpointEvent = {
  id: "event-checkpoint-d1",
  runId: current.id,
  kind: "run.checkpoint",
  actor: "semogtw-owner",
  source: "manual",
  summary: next.summary,
  before: current,
  after: next,
  occurredAt: next.updatedAt,
  idempotencyKey: "owner-run-checkpoint-11111111-1111-4111-8111-111111111111",
  correlationId: "correlation-owner-checkpoint-11111111-1111-4111-8111-111111111111",
};
const checkpoint: CooperativeRunCheckpoint = {
  id: "run-checkpoint-11111111-1111-4111-8111-111111111111",
  runId: current.id,
  eventId: event.id,
  phase: next.phase,
  progress: next.progress,
  branch: next.branch,
  summary: next.summary,
  commits: ["abcdef1"],
  testsStatus: "partial",
  testsSummary: "Typecheck pendente.",
  blockers: "",
  nextStep: next.nextAction ?? "",
  capturedAt: next.updatedAt,
  sourceHash: "source-hash-1",
};

function replayRow(overrides: Record<string, unknown> = {}) {
  return {
    event_id: event.id,
    event_kind: event.kind,
    event_actor: event.actor,
    event_source: event.source,
    event_summary: event.summary,
    before_json: JSON.stringify(current),
    after_json: JSON.stringify(next),
    occurred_at: event.occurredAt,
    correlation_id: event.correlationId,
    checkpoint_id: checkpoint.id,
    checkpoint_run_id: checkpoint.runId,
    checkpoint_event_id: checkpoint.eventId,
    checkpoint_phase: checkpoint.phase,
    checkpoint_progress: checkpoint.progress,
    checkpoint_branch: checkpoint.branch,
    checkpoint_summary: checkpoint.summary,
    commits_json: JSON.stringify(checkpoint.commits),
    tests_status: checkpoint.testsStatus,
    tests_summary: checkpoint.testsSummary,
    blockers: checkpoint.blockers,
    next_step: checkpoint.nextStep,
    captured_at: checkpoint.capturedAt,
    source_hash: checkpoint.sourceHash,
    ...overrides,
  };
}

describe("D1CooperativeRunCheckpointRepository", () => {
  it("updates run, appends event and checkpoint in one guarded batch", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, checkpoint),
    ).resolves.toBe("recorded");

    const [update, insertEvent, insertCheckpoint] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("AND updated_at = ?");
    expect(update?.sql).toContain("idempotency_key = ?");
    expect(update?.sql).toContain("source_hash = ?");
    expect(insertEvent?.sql).toContain("WHERE changes() = 1");
    expect(insertCheckpoint?.sql).toContain("WHERE changes() = 1");
    expect(insertCheckpoint?.sql).toContain("MAX(sequence)");
    expect(insertCheckpoint?.params).toContain(JSON.stringify(checkpoint.commits));
  });

  it("classifies an exact persisted replay as duplicate", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(replayRow());
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, checkpoint),
    ).resolves.toBe("duplicate");
  });

  it("rejects a reused idempotency key with different checkpoint intent", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(replayRow({ tests_summary: "Outro resultado." }));
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, checkpoint),
    ).resolves.toBe("conflict");
  });

  it("rejects inconsistent identities before touching D1", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, { ...checkpoint, runId: "other" }),
    ).resolves.toBe("conflict");
    expect(binding.batches).toHaveLength(0);
  });

  it("fails closed when D1 omits update changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, checkpoint),
    ).rejects.toThrow("missing changes metadata");
  });

  it("fails closed if a successful update does not persist all batch rows", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 1 } },
      { results: [], success: true, meta: { changes: 1 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    const repository = new D1CooperativeRunCheckpointRepository(binding);

    await expect(
      repository.record(current, next, event, checkpoint),
    ).rejects.toThrow("batch was incomplete");
  });
});
