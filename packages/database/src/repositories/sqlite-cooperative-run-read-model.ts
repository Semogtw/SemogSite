import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { createSqliteDatabase } from "../client";
import type { CooperativeRunLedgerEvent } from "./d1-cooperative-run-read-model";

type SqliteDatabase = ReturnType<typeof createSqliteDatabase>;

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

export class SqliteCooperativeRunReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async listRecent(input: {
    limit: number;
    status?: CooperativeRunSnapshot["status"];
  }): Promise<readonly CooperativeRunSnapshot[]> {
    const rows = input.status === undefined
      ? this.database.$client
          .prepare(
            `SELECT
              id, project_id, title, actor_label, origin, status, phase, progress,
              branch, summary, blocker, next_action, started_at, last_heartbeat_at,
              finished_at, stale_after_seconds, updated_at
            FROM cooperative_runs
            ORDER BY updated_at DESC, id DESC
            LIMIT ?`,
          )
          .all(input.limit)
      : this.database.$client
          .prepare(
            `SELECT
              id, project_id, title, actor_label, origin, status, phase, progress,
              branch, summary, blocker, next_action, started_at, last_heartbeat_at,
              finished_at, stale_after_seconds, updated_at
            FROM cooperative_runs
            WHERE status = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT ?`,
          )
          .all(input.status, input.limit);
    return (rows as RunRow[]).map(toSnapshot);
  }

  async findRun(runId: string): Promise<CooperativeRunSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT
          id, project_id, title, actor_label, origin, status, phase, progress,
          branch, summary, blocker, next_action, started_at, last_heartbeat_at,
          finished_at, stale_after_seconds, updated_at
        FROM cooperative_runs
        WHERE id = ?
        LIMIT 1`,
      )
      .get(runId) as RunRow | undefined;
    return row === undefined ? null : toSnapshot(row);
  }

  async listEvents(
    runId: string,
    limit: number,
  ): Promise<readonly CooperativeRunLedgerEvent[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT
          id, sequence, kind, actor, source, summary, before_json, after_json,
          occurred_at, idempotency_key, correlation_id
        FROM cooperative_run_events
        WHERE run_id = ?
        ORDER BY sequence DESC
        LIMIT ?`,
      )
      .all(runId, limit) as EventRow[];
    return rows.map(toEvent);
  }
}
