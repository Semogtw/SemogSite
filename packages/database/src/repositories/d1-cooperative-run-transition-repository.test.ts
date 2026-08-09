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
  kind: "progress.updated",
  actor: "semogtw-owner",
  summary: next.summary,
  occurredAt: next.updatedAt,
  source: "chatgpt",
  idempotencyKey: "run-transition-1",
  correlationId: "run-transition-correlation-1",
};

function replayRow(after: CooperativeRunSnapshot = next) {
  return {
    id: event.id,
    actor: event.actor,
    source: event.source,
    summary: event.summary,
    before_json: JSON.stringify(current),
    after_json: JSON.stringify(after),
    correlation_id: event.correlationId,
  };
}

describe("D1CooperativeRunTransitionRepository", () => {
  it("updates by observed timestamp and appends the next ledger sequence", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.transition(current, next, event)).resolves.toBe("updated");
    const [update, insertEvent] = binding.batches[0] ?? [];
    expect(update?.sql).toContain("AND updated_at = ?");
    expect(update?.sql).toContain("idempotency_key = ?");
    expect(update?.params.slice(-4)).toEqual([
      current.id,
      current.updatedAt,
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

    await expect(repository.transition(current, next, event)).resolves.toBe("duplicate");
  });

  it("rejects idempotency replay with different semantic intent", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(
      replayRow({ ...next, summary: "Payload conflitante." }),
    );
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.transition(current, next, event)).resolves.toBe("conflict");
  });

  it("classifies a lost timestamp race as stale", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(null);
    binding.allResponses.push({
      success: true,
      results: [{
        id: current.id,
        project_id: current.projectId,
        title: current.title,
        actor_label: current.actorLabel,
        origin: current.origin,
        status: current.status,
        phase: current.phase,
        progress: current.progress,
        branch: current.branch,
        summary: current.summary,
        blocker: current.blocker,
        next_action: current.nextAction,
        started_at: current.startedAt,
        last_heartbeat_at: current.lastHeartbeatAt,
        finished_at: current.finishedAt,
        stale_after_seconds: current.staleAfterSeconds,
        updated_at: "2026-08-09T04:06:00.000Z",
      }],
    });
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.transition(current, next, event)).resolves.toBe("stale");
  });

  it("fails closed when D1 omits transition changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1CooperativeRunTransitionRepository(binding);

    await expect(repository.transition(current, next, event)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
