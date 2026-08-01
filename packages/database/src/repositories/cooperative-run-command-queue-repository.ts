import type {
  CooperativeRunCommand,
  CooperativeRunCommandQueueRepository,
  CooperativeRunCommandQueueStoreResult,
  CooperativeRunCommandQueuedEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

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

type ExistingCommandRow = {
  id: string;
  run_id: string;
  kind: string;
  status: string;
  summary: string;
  payload_json: string;
  reason: string | null;
  queued_by: string;
  correlation_id: string;
  queued_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

type ExistingEventRow = {
  id: string;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
};

const terminalStatuses = new Set<CooperativeRunSnapshot["status"]>([
  "completed",
  "failed",
  "cancelled",
]);

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

function sameCommandPayload(
  existing: ExistingCommandRow,
  command: CooperativeRunCommand,
): boolean {
  return (
    existing.id === command.id &&
    existing.run_id === command.runId &&
    existing.kind === command.kind &&
    existing.status === command.status &&
    existing.summary === command.summary &&
    existing.payload_json === JSON.stringify(command.payload) &&
    existing.reason === command.reason &&
    existing.queued_by === command.queuedBy &&
    existing.correlation_id === command.correlationId &&
    existing.queued_at === command.queuedAt &&
    existing.acknowledged_at === command.acknowledgedAt &&
    existing.completed_at === command.completedAt &&
    existing.expires_at === command.expiresAt &&
    existing.updated_at === command.updatedAt
  );
}

function sameEventPayload(
  existing: ExistingEventRow,
  command: CooperativeRunCommand,
  event: CooperativeRunCommandQueuedEvent,
): boolean {
  return (
    existing.id === event.id &&
    existing.kind === event.kind &&
    existing.actor === event.actor &&
    existing.source === event.source &&
    existing.summary === event.summary &&
    existing.before_json === null &&
    existing.after_json === JSON.stringify(command) &&
    existing.occurred_at === event.occurredAt &&
    existing.correlation_id === event.correlationId
  );
}

export class SqliteCooperativeRunCommandQueueRepository
  implements CooperativeRunCommandQueueRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findRun(runId: string): Promise<CooperativeRunSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, project_id, title, actor_label, origin, status, phase,
                progress, branch, summary, blocker, next_action, started_at,
                last_heartbeat_at, finished_at, stale_after_seconds, updated_at
         FROM cooperative_runs
         WHERE id = ?`,
      )
      .get(runId) as RunRow | undefined;

    return row === undefined ? null : toSnapshot(row);
  }

  async queue(
    run: CooperativeRunSnapshot,
    command: CooperativeRunCommand,
    event: CooperativeRunCommandQueuedEvent,
  ): Promise<CooperativeRunCommandQueueStoreResult> {
    const transaction = this.database.$client.transaction(() => {
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
        return "conflict" as const;
      }

      const existingCommand = this.database.$client
        .prepare(
          `SELECT id, run_id, kind, status, summary, payload_json, reason,
                  queued_by, correlation_id, queued_at, acknowledged_at,
                  completed_at, expires_at, updated_at
           FROM cooperative_run_commands
           WHERE run_id = ? AND idempotency_key = ?`,
        )
        .get(run.id, command.idempotencyKey) as ExistingCommandRow | undefined;
      const existingEvent = this.database.$client
        .prepare(
          `SELECT id, kind, actor, source, summary, before_json, after_json,
                  occurred_at, correlation_id
           FROM cooperative_run_events
           WHERE run_id = ? AND idempotency_key = ?`,
        )
        .get(run.id, event.idempotencyKey) as ExistingEventRow | undefined;

      if (existingCommand !== undefined || existingEvent !== undefined) {
        return existingCommand !== undefined &&
          existingEvent !== undefined &&
          sameCommandPayload(existingCommand, command) &&
          sameEventPayload(existingEvent, command, event)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const current = this.database.$client
        .prepare("SELECT status, updated_at FROM cooperative_runs WHERE id = ?")
        .get(run.id) as
        | { status: CooperativeRunSnapshot["status"]; updated_at: string }
        | undefined;
      if (
        current === undefined ||
        current.status !== run.status ||
        current.updated_at !== run.updatedAt ||
        terminalStatuses.has(current.status)
      ) {
        return "conflict" as const;
      }

      const sequenceRow = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM cooperative_run_events
           WHERE run_id = ?`,
        )
        .get(run.id) as { sequence: number };

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_run_commands (
            id, run_id, kind, status, summary, payload_json, reason, queued_by,
            idempotency_key, correlation_id, queued_at, acknowledged_at,
            completed_at, expires_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
        );

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_run_events (
            id, run_id, sequence, kind, actor, source, summary, before_json,
            after_json, occurred_at, idempotency_key, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.runId,
          sequenceRow.sequence,
          event.kind,
          event.actor,
          event.source,
          event.summary,
          JSON.stringify(command),
          event.occurredAt,
          event.idempotencyKey,
          event.correlationId,
        );

      return "queued" as const;
    });

    return transaction.immediate();
  }
}
