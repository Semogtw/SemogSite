import type { CooperativeRunSnapshot } from "@semogtw/domain";
import type { D1DatabaseBinding, D1QueryResult } from "../adapters/d1";
import {
  mapCooperativeRunCheckpoint,
  mapCooperativeRunCommand,
  normalizeCooperativeRunReadLimit,
  type CooperativeRunCheckpointRead,
  type CooperativeRunCheckpointRow,
  type CooperativeRunCommandRead,
  type CooperativeRunCommandRow,
} from "./cooperative-run-related-read";

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
  before_json?: string | null;
  after_json?: string | null;
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

export type CooperativeRunListRecentInput = {
  limit: number;
  status?: CooperativeRunSnapshot["status"];
  projectId?: string;
  cursor?: {
    updatedAt: string;
    id: string;
  };
};

export type CooperativeRunEventListOptions = {
  limit: number;
  beforeSequence?: number;
  includeSnapshots?: boolean;
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

function parseJson(value: string | null | undefined): unknown {
  if (value == null) return null;
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

  async listRecent(
    input: CooperativeRunListRecentInput,
  ): Promise<readonly CooperativeRunSnapshot[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (input.projectId !== undefined) {
      clauses.push("project_id = ?");
      params.push(input.projectId);
    }
    if (input.status !== undefined) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.cursor !== undefined) {
      clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      params.push(input.cursor.updatedAt, input.cursor.updatedAt, input.cursor.id);
    }

    const where = clauses.length === 0 ? "" : `\nWHERE ${clauses.join(" AND ")}`;
    const result = await this.database
      .prepare(
        `SELECT
          id, project_id, title, actor_label, origin, status, phase, progress,
          branch, summary, blocker, next_action, started_at, last_heartbeat_at,
          finished_at, stale_after_seconds, updated_at
        FROM cooperative_runs${where}
        ORDER BY updated_at DESC, id DESC
        LIMIT ?`,
      )
      .bind(...params, input.limit)
      .all<RunRow>();
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
    input: number | CooperativeRunEventListOptions,
  ): Promise<readonly CooperativeRunLedgerEvent[]> {
    const options: CooperativeRunEventListOptions =
      typeof input === "number" ? { limit: input } : input;
    const snapshotColumns = options.includeSnapshots === true
      ? ", before_json, after_json"
      : "";
    const cursorClause = options.beforeSequence === undefined
      ? ""
      : " AND sequence < ?";
    const params: unknown[] = [runId];
    if (options.beforeSequence !== undefined) params.push(options.beforeSequence);
    params.push(options.limit);

    const result = await this.database
      .prepare(
        `SELECT
          id, sequence, kind, actor, source, summary${snapshotColumns},
          occurred_at, idempotency_key, correlation_id
        FROM cooperative_run_events
        WHERE run_id = ?${cursorClause}
        ORDER BY sequence DESC
        LIMIT ?`,
      )
      .bind(...params)
      .all<EventRow>();
    assertQuerySucceeded(result, "cooperative run event list");
    return result.results.map(toEvent);
  }

  async listCheckpoints(
    runId: string,
    limit = 100,
  ): Promise<readonly CooperativeRunCheckpointRead[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id, event_id, sequence, phase, progress, branch, summary,
          commits_json, tests_status, tests_summary, blockers, next_step,
          captured_at, source_hash
        FROM cooperative_run_checkpoints
        WHERE run_id = ?
        ORDER BY sequence DESC, id DESC
        LIMIT ?`,
      )
      .bind(runId, normalizeCooperativeRunReadLimit(limit, 100))
      .all<CooperativeRunCheckpointRow>();
    assertQuerySucceeded(result, "cooperative run checkpoint list");
    return result.results.map(mapCooperativeRunCheckpoint);
  }

  async listCommands(
    runId: string,
    input: { limit: number; observedAt: string },
  ): Promise<readonly CooperativeRunCommandRead[]> {
    const result = await this.database
      .prepare(
        `SELECT
          id, kind, status, summary, payload_json, reason, queued_by,
          correlation_id, queued_at, acknowledged_at, completed_at,
          expires_at, updated_at
        FROM cooperative_run_commands
        WHERE run_id = ?
        ORDER BY queued_at DESC, id DESC
        LIMIT ?`,
      )
      .bind(runId, normalizeCooperativeRunReadLimit(input.limit, 100))
      .all<CooperativeRunCommandRow>();
    assertQuerySucceeded(result, "cooperative run command list");
    return result.results.map((row) =>
      mapCooperativeRunCommand(row, input.observedAt),
    );
  }
}
