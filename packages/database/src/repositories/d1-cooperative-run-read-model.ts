import type { CooperativeRunSnapshot } from "@semogtw/domain";
import type { D1DatabaseBinding, D1QueryResult } from "../adapters/d1";

type RunRow = {
  id: string;
  project_id: string | null;
  title: string;
  actor_label: string;
  origin: CooperativeRunSnapshot["origin"];
  status: CooperativeRunSnapshot["status"];
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  blocker: string | null;
  next_action: string;
  started_at: string;
  last_heartbeat_at: string;
  finished_at: string | null;
  stale_after_seconds: number;
  updated_at: string;
};

type EventRow = {
  id: string;
  sequence: number;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  idempotency_key: string;
  correlation_id: string;
};

export type CooperativeRunLedgerEvent = {
  id: string;
  sequence: number;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before: unknown;
  after: unknown;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

function assertQuerySucceeded(result: D1QueryResult, operation: string): void {
  if (result.success === false || (result.error?.length ?? 0) > 0) {
    throw new Error(`D1 ${operation} failed.`);
  }
}

function toSnapshot(row: RunRow): CooperativeRunSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    actorLabel: row.actor_label,
    origin: row.origin,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    branch: row.branch,
    summary: row.summary,
    blocker: row.blocker,
    nextAction: row.next_action,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    finishedAt: row.finished_at,
    staleAfterSeconds: row.stale_after_seconds,
    updatedAt: row.updated_at,
  };
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toEvent(row: EventRow): CooperativeRunLedgerEvent {
  return {
    id: row.id,
    sequence: row.sequence,
    kind: row.kind,
    actor: row.actor,
    source: row.source,
    summary: row.summary,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    occurredAt: row.occurred_at,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
  };
}

export class D1CooperativeRunReadModel {
  constructor(private readonly database: D1DatabaseBinding) {}

  async listRecent(input: {
    limit: number;
    status?: CooperativeRunSnapshot["status"];
  }): Promise<readonly CooperativeRunSnapshot[]> {
    const statement = input.status === undefined
      ? this.database.prepare(
          `SELECT
            id, project_id, title, actor_label, origin, status, phase, progress,
            branch, summary, blocker, next_action, started_at, last_heartbeat_at,
            finished_at, stale_after_seconds, updated_at
          FROM cooperative_runs
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
        ).bind(input.limit)
      : this.database.prepare(
          `SELECT
            id, project_id, title, actor_label, origin, status, phase, progress,
            branch, summary, blocker, next_action, started_at, last_heartbeat_at,
            finished_at, stale_after_seconds, updated_at
          FROM cooperative_runs
          WHERE status = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
        ).bind(input.status, input.limit);

    const result = await statement.all<RunRow>();
    assertQuerySucceeded(result, "cooperative run list");
    return result.results.map(toSnapshot);
  }

  async findRun(runId: string): Promise<CooperativeRunSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT
          id, project_id, title, actor_label, origin, status, phase, progress,
          branch, summary, blocker, next_action, started_at, last_heartbeat_at,
          finished_at, stale_after_seconds, updated_at
        FROM cooperative_runs
        WHERE id = ?
        LIMIT 1`,
      )
      .bind(runId)
      .all<RunRow>();
    assertQuerySucceeded(result, "cooperative run detail");
    const row = result.results[0];
    return row === undefined ? null : toSnapshot(row);
  }

  async listEvents(
    runId: string,
    limit: number,
  ): Promise<readonly CooperativeRunLedgerEvent[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id, sequence, kind, actor, source, summary, before_json, after_json,
          occurred_at, idempotency_key, correlation_id
        FROM cooperative_run_events
        WHERE run_id = ?
        ORDER BY sequence DESC
        LIMIT ?`,
      )
      .bind(runId, limit)
      .all<EventRow>();
    assertQuerySucceeded(result, "cooperative run event list");
    return result.results.map(toEvent);
  }
}
