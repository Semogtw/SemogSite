import type {
  CooperativeRunEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunTransitionRepository } from "./d1-cooperative-run-transition-repository";

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

const current: CooperativeRunSnapshot = {
  id: "cooperative-run-1",
  projectId: "project-1",
  title: "Portar lifecycle D1",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "implementation",
  progress: 25,
  branch: "main",
  summary: "Repository em progresso.",
  blocker: null,
  nextAction: "Adicionar testes.",
  startedAt: "2026-08-09T04:00:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:05:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:05:00.000Z",
};
const next: CooperativeRunSnapshot = {
  ...current,
  progress: 50,
  summary: "Repository e testes concluídos.",
  nextAction: "Expor API.",
  lastHeartbeatAt: "2026-08-09T04:10:00.000Z",
  updatedAt: "2026-08-09T04:10:00.000Z",
};
const event: CooperativeRunEvent = {
  id: "run-event-transition-1",
  runId: current.id,
  kind: "run.checkpoint",
  actor: "semogtw-owner",
  source: "chatgpt",
  summary: next.summary,
  before: current,
  after: next,
  occurredAt: next.updatedAt,
  idempotencyKey: "run-transition-1",
  correlationId: "run-transition-correlation-1",
};

function replayRow(after: CooperativeRunSnapshot = next) {
  return {
    id: event.id,
    kind: event.kind,
    actor: event.actor,
    source: event.source,
    summary: event.summary,
    before_json: JSON.stringify(current),
    after_json: JSON.stringify(after),
    occurred_at: event.occurredAt,
    correlation_id: event.correlationId,
  };
}

describe("D1CooperativeRunTransitionRepository", () => {
  it("updates the observed state and appends the next ledger sequence", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.apply(current, next, event)).resolves.toBe("updated");
    const [update, insertEvent] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("AND updated_at = ?");
    expect(update?.sql).toContain("AND status = ?");
    expect(update?.sql).toContain("AND progress = ?");
    expect(update?.sql).toContain("AND last_heartbeat_at = ?");
    expect(update?.sql).toContain("idempotency_key = ?");
    expect(update?.params.slice(-7)).toEqual([
      current.id,
      current.updatedAt,
      current.status,
      current.progress,
      current.lastHeartbeatAt,
      current.id,
      event.idempotencyKey,
    ]);
    expect(insertEvent?.sql).toContain("MAX(sequence)");
    expect(insertEvent?.sql).toContain("WHERE changes() = 1");
    expect(insertEvent?.params).toContain(JSON.stringify(current));
    expect(insertEvent?.params).toContain(JSON.stringify(next));
  });

  it("treats an exact ledger replay as duplicate", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(replayRow());
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.apply(current, next, event)).resolves.toBe("duplicate");
  });

  it("rejects an idempotency replay with different semantic intent", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(
      replayRow({ ...next, summary: "Payload conflitante." }),
    );
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.apply(current, next, event)).resolves.toBe("conflict");
  });

  it("classifies a lost optimistic race as conflict", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(null);
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.apply(current, next, event)).resolves.toBe("conflict");
  });

  it("rejects inconsistent event identities before touching D1", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(
      repository.apply(current, next, { ...event, runId: "other-run" }),
    ).resolves.toBe("conflict");
    expect(binding.batches).toHaveLength(0);
  });

  it("fails closed when D1 omits transition changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.apply(current, next, event)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
