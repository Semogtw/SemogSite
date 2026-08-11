import type {
  CooperativeRunCommand,
  CooperativeRunCommandQueuedEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunCommandQueueRepository } from "./d1-cooperative-run-command-queue-repository";

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

const run: CooperativeRunSnapshot = {
  id: "run-command-d1",
  projectId: null,
  title: "Run",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "implementation",
  progress: 50,
  branch: "main",
  summary: "Em andamento.",
  blocker: null,
  nextAction: "Continuar.",
  startedAt: "2026-08-11T09:00:00.000Z",
  lastHeartbeatAt: "2026-08-11T09:10:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-11T09:10:00.000Z",
};
const command: CooperativeRunCommand = {
  id: "run-command-1",
  runId: run.id,
  kind: "request_checkpoint",
  status: "queued",
  summary: "Envie um checkpoint.",
  payload: { include: ["commits", "tests"] },
  reason: null,
  queuedBy: "semogtw-owner",
  idempotencyKey: "owner-command-1",
  correlationId: "correlation-owner-command-1",
  queuedAt: "2026-08-11T09:20:00.000Z",
  acknowledgedAt: null,
  completedAt: null,
  expiresAt: null,
  updatedAt: "2026-08-11T09:20:00.000Z",
};
const event: CooperativeRunCommandQueuedEvent = {
  id: "run-event-command-1",
  runId: run.id,
  kind: "run.command_queued",
  actor: command.queuedBy,
  source: "manual",
  summary: command.summary,
  command,
  occurredAt: command.queuedAt,
  idempotencyKey: command.idempotencyKey,
  correlationId: command.correlationId,
};

function replayRow(overrides: Record<string, unknown> = {}) {
  return {
    command_id: command.id,
    command_run_id: command.runId,
    command_kind: command.kind,
    command_status: command.status,
    command_summary: command.summary,
    payload_json: JSON.stringify(command.payload),
    command_reason: command.reason,
    queued_by: command.queuedBy,
    command_correlation_id: command.correlationId,
    queued_at: command.queuedAt,
    acknowledged_at: command.acknowledgedAt,
    completed_at: command.completedAt,
    expires_at: command.expiresAt,
    command_updated_at: command.updatedAt,
    event_id: event.id,
    event_kind: event.kind,
    event_actor: event.actor,
    event_source: event.source,
    event_summary: event.summary,
    before_json: null,
    after_json: JSON.stringify(command),
    occurred_at: event.occurredAt,
    event_correlation_id: event.correlationId,
    ...overrides,
  };
}

describe("D1CooperativeRunCommandQueueRepository", () => {
  it("queues command and ledger event atomically against observed run state", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunCommandQueueRepository(binding);

    await expect(repository.queue(run, command, event)).resolves.toBe("queued");
    const [insertCommand, insertEvent] = binding.batches[0] ?? [];
    expect(insertCommand?.sql).toContain("status NOT IN ('completed', 'failed', 'cancelled')");
    expect(insertCommand?.sql).toContain("updated_at = ?");
    expect(insertCommand?.sql).toContain("idempotency_key = ?");
    expect(insertEvent?.sql).toContain("WHERE changes() = 1");
    expect(insertEvent?.sql).toContain("MAX(sequence)");
  });

  it("recognizes a semantic replay even when server timestamps differ", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(
      replayRow({
        queued_at: "2026-08-11T09:21:00.000Z",
        command_updated_at: "2026-08-11T09:21:00.000Z",
        occurred_at: "2026-08-11T09:21:00.000Z",
        after_json: JSON.stringify({
          ...command,
          queuedAt: "2026-08-11T09:21:00.000Z",
          updatedAt: "2026-08-11T09:21:00.000Z",
        }),
      }),
    );
    const repository = new D1CooperativeRunCommandQueueRepository(binding);
    await expect(repository.queue(run, command, event)).resolves.toBe("duplicate");

    const collision = new CapturingD1();
    collision.batchResults = binding.batchResults;
    collision.firstResponses.push(replayRow({ command_summary: "Outro comando" }));
    await expect(
      new D1CooperativeRunCommandQueueRepository(collision).queue(run, command, event),
    ).resolves.toBe("conflict");
  });

  it("rejects inconsistent command/event identities before D1 writes", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunCommandQueueRepository(binding);
    await expect(
      repository.queue(run, command, { ...event, runId: "other-run" }),
    ).resolves.toBe("conflict");
    expect(binding.batches).toHaveLength(0);
  });

  it("fails closed when D1 metadata is missing or the event insert is incomplete", async () => {
    const missing = new CapturingD1();
    missing.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    await expect(
      new D1CooperativeRunCommandQueueRepository(missing).queue(run, command, event),
    ).rejects.toThrow("missing changes metadata");

    const incomplete = new CapturingD1();
    incomplete.batchResults = [
      { results: [], success: true, meta: { changes: 1 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    await expect(
      new D1CooperativeRunCommandQueueRepository(incomplete).queue(run, command, event),
    ).rejects.toThrow("batch was incomplete");
  });
});
