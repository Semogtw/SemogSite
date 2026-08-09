import type {
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunRegistrationRepository } from "./d1-cooperative-run-registration-repository";

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

const run: CooperativeRunSnapshot = {
  id: "cooperative-run-1",
  projectId: "project-1",
  title: "Portar writes D1",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "worker-parity",
  progress: 0,
  branch: "main",
  summary: "Iniciando port seguro.",
  blocker: null,
  nextAction: "Adicionar cobertura.",
  startedAt: "2026-08-09T04:10:00.000Z",
  lastHeartbeatAt: "2026-08-09T04:10:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 1800,
  updatedAt: "2026-08-09T04:10:00.000Z",
};
const event: CooperativeRunRegistrationEvent = {
  id: "run-event-registration-1",
  runId: run.id,
  kind: "run.registered",
  actor: "semogtw-owner",
  summary: run.summary,
  occurredAt: run.startedAt,
  source: run.origin,
  idempotencyKey: "run-registration-1",
  correlationId: "correlation-run-registration-1",
};

function replayRow(after: CooperativeRunSnapshot = run) {
  return {
    id: event.id,
    actor: event.actor,
    source: event.source,
    summary: event.summary,
    after_json: JSON.stringify(after),
    correlation_id: event.correlationId,
  };
}

describe("D1CooperativeRunRegistrationRepository", () => {
  it("inserts run then event in one batch and gates the event on changes()", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(repository.register(run, event)).resolves.toBe("created");
    const [runInsert, eventInsert] = binding.batches[0] ?? [];
    expect(runInsert?.sql).toContain("status <> 'archived'");
    expect(runInsert?.sql).toContain("NOT EXISTS (SELECT 1 FROM cooperative_runs");
    expect(eventInsert?.sql).toContain("WHERE changes() = 1");
    expect(eventInsert?.params).toContain(JSON.stringify(run));
  });

  it("classifies a zero-row insert as semantic duplicate only for the same intent", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(replayRow());
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(repository.register(run, event)).resolves.toBe("duplicate");
  });

  it("treats reused idempotency with different intent as conflict", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(replayRow({ ...run, title: "Outro run" }));
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(repository.register(run, event)).resolves.toBe("conflict");
  });

  it("classifies a missing or archived project after a zero-row insert", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.firstResponses.push(null, null);
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(repository.register(run, event)).resolves.toBe("project_not_found");
  });

  it("rejects mismatched run/event identity without touching D1", async () => {
    const binding = new CapturingD1();
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(
      repository.register(run, { ...event, runId: "other-run" }),
    ).resolves.toBe("conflict");
    expect(binding.batches).toHaveLength(0);
  });

  it("fails closed when D1 omits run insert changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1CooperativeRunRegistrationRepository(binding);

    await expect(repository.register(run, event)).rejects.toThrow(
      "missing changes metadata",
    );
  });
});
