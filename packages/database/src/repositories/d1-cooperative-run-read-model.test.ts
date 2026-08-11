import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1CooperativeRunReadModel } from "./d1-cooperative-run-read-model";

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
    this.owner.executed.push(this);
    return (this.owner.responses.shift() ?? {
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
  readonly responses: D1QueryResult[] = [];
  readonly executed: Statement[] = [];
  prepare(query: string): D1PreparedStatementBinding {
    return new Statement(this, query);
  }
  async batch(): Promise<readonly D1QueryResult[]> {
    return [];
  }
}

const runRow = {
  id: "cooperative-run-1",
  project_id: "project-1",
  title: "Portar leitura D1",
  actor_label: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "read-model",
  progress: 70,
  branch: "main",
  summary: "Leitura em implementação.",
  blocker: null,
  next_action: "Expor rota.",
  started_at: "2026-08-09T04:00:00.000Z",
  last_heartbeat_at: "2026-08-09T04:30:00.000Z",
  finished_at: null,
  stale_after_seconds: 1800,
  updated_at: "2026-08-09T04:30:00.000Z",
};

describe("D1CooperativeRunReadModel", () => {
  it("lists recent runs deterministically and supports status filtering", async () => {
    const binding = new CapturingD1();
    binding.responses.push({ success: true, results: [runRow] });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(model.listRecent({ limit: 25, status: "running" })).resolves.toEqual([
      {
        id: runRow.id,
        projectId: runRow.project_id,
        title: runRow.title,
        actorLabel: runRow.actor_label,
        origin: runRow.origin,
        status: runRow.status,
        phase: runRow.phase,
        progress: runRow.progress,
        branch: runRow.branch,
        summary: runRow.summary,
        blocker: runRow.blocker,
        nextAction: runRow.next_action,
        startedAt: runRow.started_at,
        lastHeartbeatAt: runRow.last_heartbeat_at,
        finishedAt: runRow.finished_at,
        staleAfterSeconds: runRow.stale_after_seconds,
        updatedAt: runRow.updated_at,
      },
    ]);
    const query = binding.executed[0];
    expect(query?.sql).toContain("WHERE status = ?");
    expect(query?.sql).toContain("ORDER BY updated_at DESC, id DESC");
    expect(query?.params).toEqual(["running", 25]);
  });

  it("returns one run or null without exposing D1 errors", async () => {
    const binding = new CapturingD1();
    binding.responses.push({ success: true, results: [runRow] });
    binding.responses.push({ success: true, results: [] });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(model.findRun(runRow.id)).resolves.toMatchObject({ id: runRow.id });
    await expect(model.findRun("missing-run")).resolves.toBeNull();
  });

  it("maps the newest ledger events and parses before/after snapshots", async () => {
    const binding = new CapturingD1();
    binding.responses.push({
      success: true,
      results: [
        {
          id: "event-2",
          sequence: 2,
          kind: "progress.updated",
          actor: "semogtw-owner",
          source: "chatgpt",
          summary: "Progresso atualizado.",
          before_json: JSON.stringify({ progress: 40 }),
          after_json: JSON.stringify({ progress: 70 }),
          occurred_at: "2026-08-09T04:30:00.000Z",
          idempotency_key: "progress-2",
          correlation_id: "correlation-2",
        },
      ],
    });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(model.listEvents(runRow.id, 50)).resolves.toEqual([
      {
        id: "event-2",
        sequence: 2,
        kind: "progress.updated",
        actor: "semogtw-owner",
        source: "chatgpt",
        summary: "Progresso atualizado.",
        before: { progress: 40 },
        after: { progress: 70 },
        occurredAt: "2026-08-09T04:30:00.000Z",
        idempotencyKey: "progress-2",
        correlationId: "correlation-2",
      },
    ]);
    expect(binding.executed[0]?.sql).toContain("ORDER BY sequence DESC");
    expect(binding.executed[0]?.params).toEqual([runRow.id, 50]);
  });

  it("maps related checkpoints defensively and bounds the D1 query", async () => {
    const binding = new CapturingD1();
    binding.responses.push({
      success: true,
      results: [
        {
          id: "checkpoint-malformed",
          event_id: "event-checkpoint-2",
          sequence: 2,
          phase: "validation",
          progress: 80,
          branch: "main",
          summary: "Malformed historical commits.",
          commits_json: "{broken",
          tests_status: "not_run",
          tests_summary: "Not run.",
          blockers: "",
          next_step: "Continue.",
          captured_at: "2026-08-09T04:40:00.000Z",
          source_hash: null,
        },
        {
          id: "checkpoint-valid",
          event_id: "event-checkpoint-1",
          sequence: 1,
          phase: "validation",
          progress: 70,
          branch: "main",
          summary: "Valid checkpoint.",
          commits_json: '["abcdef1"]',
          tests_status: "partial",
          tests_summary: "Focused checks only.",
          blockers: "",
          next_step: "Continue.",
          captured_at: "2026-08-09T04:30:00.000Z",
          source_hash: "source-1",
        },
      ],
    });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(model.listCheckpoints(runRow.id, 500)).resolves.toEqual([
      expect.objectContaining({
        id: "checkpoint-malformed",
        commits: [],
        malformedCommits: true,
      }),
      expect.objectContaining({
        id: "checkpoint-valid",
        commits: ["abcdef1"],
        malformedCommits: false,
      }),
    ]);
    expect(binding.executed[0]?.sql).toContain(
      "ORDER BY sequence DESC, id DESC",
    );
    expect(binding.executed[0]?.params).toEqual([runRow.id, 100]);
  });

  it("maps command payloads defensively and derives queue availability at one observed time", async () => {
    const binding = new CapturingD1();
    binding.responses.push({
      success: true,
      results: [
        {
          id: "command-expired",
          kind: "request_checkpoint",
          status: "queued",
          summary: "Expired command.",
          payload_json: '{"include":["tests"]}',
          reason: null,
          queued_by: "semogtw-owner",
          correlation_id: "correlation-command-expired",
          queued_at: "2026-08-09T04:20:00.000Z",
          acknowledged_at: null,
          completed_at: null,
          expires_at: "2026-08-09T04:29:00.000Z",
          updated_at: "2026-08-09T04:20:00.000Z",
        },
        {
          id: "command-malformed",
          kind: "provide_context",
          status: "rejected",
          summary: "Malformed historical payload.",
          payload_json: "[1,2,3]",
          reason: "Rejected.",
          queued_by: "semogtw-owner",
          correlation_id: "correlation-command-malformed",
          queued_at: "2026-08-09T04:10:00.000Z",
          acknowledged_at: "2026-08-09T04:11:00.000Z",
          completed_at: "2026-08-09T04:12:00.000Z",
          expires_at: null,
          updated_at: "2026-08-09T04:12:00.000Z",
        },
      ],
    });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(
      model.listCommands(runRow.id, {
        limit: 500,
        observedAt: "2026-08-09T04:30:00.000Z",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "command-expired",
        payload: { include: ["tests"] },
        malformedPayload: false,
        queueAvailability: "expired",
      }),
      expect.objectContaining({
        id: "command-malformed",
        payload: null,
        malformedPayload: true,
        queueAvailability: "not_applicable",
      }),
    ]);
    expect(binding.executed[0]?.sql).toContain(
      "ORDER BY queued_at DESC, id DESC",
    );
    expect(binding.executed[0]?.params).toEqual([runRow.id, 100]);
  });

  it("fails closed on a D1 query failure", async () => {
    const binding = new CapturingD1();
    binding.responses.push({
      success: false,
      results: [],
      error: "provider internals",
    });
    const model = new D1CooperativeRunReadModel(binding);

    await expect(model.listRecent({ limit: 10 })).rejects.toThrow(
      "D1 cooperative run list failed.",
    );
  });
});
