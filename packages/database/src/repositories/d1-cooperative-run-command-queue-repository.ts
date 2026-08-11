import type {
  CooperativeRunCommand,
  CooperativeRunCommandQueueRepository,
  CooperativeRunCommandQueueStoreResult,
  CooperativeRunCommandQueuedEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

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
  next_action: string | null;
  started_at: string;
  last_heartbeat_at: string;
  finished_at: string | null;
  stale_after_seconds: number;
  updated_at: string;
};

type ExistingReplayRow = {
  command_id: string | null;
  command_run_id: string | null;
  command_kind: string | null;
  command_status: string | null;
  command_summary: string | null;
  payload_json: string | null;
  command_reason: string | null;
  queued_by: string | null;
  command_correlation_id: string | null;
  queued_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  command_updated_at: string | null;
  event_id: string | null;
  event_kind: string | null;
  event_actor: string | null;
  event_source: string | null;
  event_summary: string | null;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string | null;
  event_correlation_id: string | null;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 cooperative run command queue batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 cooperative run command queue result is missing changes metadata.",
    );
  }
  return changes;
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

function sameStoredIntent(
  existing: ExistingReplayRow,
  command: CooperativeRunCommand,
  event: CooperativeRunCommandQueuedEvent,
): boolean {
  return (
    existing.command_id === command.id &&
    existing.command_run_id === command.runId &&
    existing.command_kind === command.kind &&
    existing.command_status === command.status &&
    existing.command_summary === command.summary &&
    existing.payload_json === JSON.stringify(command.payload) &&
    existing.command_reason === command.reason &&
    existing.queued_by === command.queuedBy &&
    existing.command_correlation_id === command.correlationId &&
    existing.acknowledged_at === command.acknowledgedAt &&
    existing.completed_at === command.completedAt &&
    existing.expires_at === command.expiresAt &&
    existing.event_id === event.id &&
    existing.event_kind === event.kind &&
    existing.event_actor === event.actor &&
    existing.event_source === event.source &&
    existing.event_summary === event.summary &&
    existing.before_json === null &&
    existing.after_json === JSON.stringify(command) &&
    existing.event_correlation_id === event.correlationId
  );
}

export class D1CooperativeRunCommandQueueRepository
  implements CooperativeRunCommandQueueRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

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

    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 cooperative run command queue lookup failed.");
    }

    const row = result.results[0];
    return row === undefined ? null : toSnapshot(row);
  }

  async queue(
    run: CooperativeRunSnapshot,
    command: CooperativeRunCommand,
    event: CooperativeRunCommandQueuedEvent,
  ): Promise<CooperativeRunCommandQueueStoreResult> {
    if (
      run.id !== command.runId ||
      run.id !== event.runId ||
      event.command.id !== command.id ||
      event.command.runId !== command.runId ||
      event.idempotencyKey !== command.idempotencyKey ||
      event.correlationId !== command.correlationId ||
      event.occurredAt !== command.queuedAt ||
      JSON.stringify(event.command) !== JSON.stringify(command)
    ) {
      return "conflict";
    }

    const insertCommand = this.database
      .prepare(
        `INSERT INTO cooperative_run_commands (
          id, run_id, kind, status, summary, payload_json, reason, queued_by,
          idempotency_key, correlation_id, queued_at, acknowledged_at,
          completed_at, expires_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM cooperative_runs
          WHERE id = ?
            AND status = ?
            AND updated_at = ?
            AND status NOT IN ('completed', 'failed', 'cancelled')
        )
          AND NOT EXISTS (
            SELECT 1 FROM cooperative_run_commands
            WHERE run_id = ? AND idempotency_key = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM cooperative_run_events
            WHERE run_id = ? AND idempotency_key = ?
          )`,
      )
      .bind(
        command.id,
        command.runId,
        command.kind,
        command.status,
        command.summary,
        JSON.stringify(command.payload),
        command.reason,
        command.queuedBy,
        command.idempotencyKey,
        command.correlationId,
        command.queuedAt,
        command.acknowledgedAt,
        command.completedAt,
        command.expiresAt,
        command.updatedAt,
        run.id,
        run.status,
        run.updatedAt,
        run.id,
        command.idempotencyKey,
        run.id,
        event.idempotencyKey,
      );

    const insertEvent = this.database
      .prepare(
        `INSERT INTO cooperative_run_events (
          id, run_id, sequence, kind, actor, source, summary, before_json,
          after_json, occurred_at, idempotency_key, correlation_id
        )
        SELECT
          ?, ?,
          COALESCE((SELECT MAX(sequence) FROM cooperative_run_events WHERE run_id = ?), 0) + 1,
          ?, ?, ?, ?, NULL, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        event.id,
        event.runId,
        event.runId,
        event.kind,
        event.actor,
        event.source,
        event.summary,
        JSON.stringify(command),
        event.occurredAt,
        event.idempotencyKey,
        event.correlationId,
      );

    const results = await this.database.batch([insertCommand, insertEvent]);
    assertBatchSucceeded(results);

    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 cooperative run command queue inserted multiple commands.");
    }
    if (changed === 1) {
      if (readChangeCount(results[1]) !== 1) {
        throw new Error("D1 cooperative run command queue batch was incomplete.");
      }
      return "queued";
    }

    const existing = await this.database
      .prepare(
        `SELECT
          command.id AS command_id,
          command.run_id AS command_run_id,
          command.kind AS command_kind,
          command.status AS command_status,
          command.summary AS command_summary,
          command.payload_json,
          command.reason AS command_reason,
          command.queued_by,
          command.correlation_id AS command_correlation_id,
          command.queued_at,
          command.acknowledged_at,
          command.completed_at,
          command.expires_at,
          command.updated_at AS command_updated_at,
          event.id AS event_id,
          event.kind AS event_kind,
          event.actor AS event_actor,
          event.source AS event_source,
          event.summary AS event_summary,
          event.before_json,
          event.after_json,
          event.occurred_at,
          event.correlation_id AS event_correlation_id
        FROM cooperative_run_commands AS command
        LEFT JOIN cooperative_run_events AS event
          ON event.run_id = command.run_id
         AND event.idempotency_key = command.idempotency_key
        WHERE command.run_id = ? AND command.idempotency_key = ?
        LIMIT 1`,
      )
      .bind(run.id, command.idempotencyKey)
      .first<ExistingReplayRow>();

    if (existing !== null && sameStoredIntent(existing, command, event)) {
      return "duplicate";
    }
    return "conflict";
  }
}
