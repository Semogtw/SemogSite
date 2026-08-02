import type {
  CooperativeRunCheckpoint,
  CooperativeRunCheckpointEvent,
  CooperativeRunCheckpointRepository,
  CooperativeRunCheckpointStoreResult,
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

type ExistingCheckpointRow = {
  id: string;
  run_id: string;
  event_id: string;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  commits_json: string;
  tests_status: string;
  tests_summary: string;
  blockers: string;
  next_step: string;
  captured_at: string;
  source_hash: string | null;
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

function sameEventPayload(
  existing: ExistingEventRow,
  before: CooperativeRunSnapshot,
  after: CooperativeRunSnapshot,
  event: CooperativeRunCheckpointEvent,
): boolean {
  return (
    existing.id === event.id &&
    existing.kind === event.kind &&
    existing.actor === event.actor &&
    existing.source === event.source &&
    existing.summary === event.summary &&
    existing.before_json === JSON.stringify(before) &&
    existing.after_json === JSON.stringify(after) &&
    existing.occurred_at === event.occurredAt &&
    existing.correlation_id === event.correlationId
  );
}

function sameCheckpointPayload(
  existing: ExistingCheckpointRow,
  checkpoint: CooperativeRunCheckpoint,
): boolean {
  return (
    existing.id === checkpoint.id &&
    existing.run_id === checkpoint.runId &&
    existing.event_id === checkpoint.eventId &&
    existing.phase === checkpoint.phase &&
    existing.progress === checkpoint.progress &&
    existing.branch === checkpoint.branch &&
    existing.summary === checkpoint.summary &&
    existing.commits_json === JSON.stringify(checkpoint.commits) &&
    existing.tests_status === checkpoint.testsStatus &&
    existing.tests_summary === checkpoint.testsSummary &&
    existing.blockers === checkpoint.blockers &&
    existing.next_step === checkpoint.nextStep &&
    existing.captured_at === checkpoint.capturedAt &&
    existing.source_hash === checkpoint.sourceHash
  );
}

export class SqliteCooperativeRunCheckpointRepository
  implements CooperativeRunCheckpointRepository
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

  async record(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunCheckpointEvent,
    checkpoint: CooperativeRunCheckpoint,
  ): Promise<CooperativeRunCheckpointStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        before.id !== after.id ||
        before.id !== event.runId ||
        before.id !== checkpoint.runId ||
        event.id !== checkpoint.eventId ||
        event.before.id !== before.id ||
        event.after.id !== after.id ||
        checkpoint.progress !== after.progress ||
        checkpoint.phase !== after.phase ||
        checkpoint.branch !== after.branch ||
        checkpoint.summary !== after.summary ||
        checkpoint.nextStep !== after.nextAction ||
        checkpoint.capturedAt !== after.updatedAt
      ) {
        return "conflict" as const;
      }

      const existingEvent = this.database.$client
        .prepare(
          `SELECT id, kind, actor, source, summary, before_json, after_json,
                  occurred_at, correlation_id
           FROM cooperative_run_events
           WHERE run_id = ? AND idempotency_key = ?`,
        )
        .get(before.id, event.idempotencyKey) as ExistingEventRow | undefined;

      if (existingEvent !== undefined) {
        const existingCheckpoint = this.database.$client
          .prepare(
            `SELECT id, run_id, event_id, phase, progress, branch, summary,
                    commits_json, tests_status, tests_summary, blockers,
                    next_step, captured_at, source_hash
             FROM cooperative_run_checkpoints
             WHERE event_id = ?`,
          )
          .get(existingEvent.id) as ExistingCheckpointRow | undefined;

        return sameEventPayload(existingEvent, before, after, event) &&
          existingCheckpoint !== undefined &&
          sameCheckpointPayload(existingCheckpoint, checkpoint)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const existingSourceHash = this.database.$client
        .prepare(
          "SELECT id FROM cooperative_run_checkpoints WHERE source_hash = ?",
        )
        .get(checkpoint.sourceHash) as { id: string } | undefined;
      if (existingSourceHash !== undefined) return "conflict" as const;

      const eventSequence = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM cooperative_run_events
           WHERE run_id = ?`,
        )
        .get(before.id) as { sequence: number };
      const checkpointSequence = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM cooperative_run_checkpoints
           WHERE run_id = ?`,
        )
        .get(before.id) as { sequence: number };

      const update = this.database.$client
        .prepare(
          `UPDATE cooperative_runs
           SET status = ?,
               phase = ?,
               progress = ?,
               branch = ?,
               summary = ?,
               blocker = ?,
               next_action = ?,
               last_heartbeat_at = ?,
               finished_at = ?,
               updated_at = ?
           WHERE id = ?
             AND updated_at = ?
             AND status = ?
             AND progress = ?
             AND last_heartbeat_at = ?`,
        )
        .run(
          after.status,
          after.phase,
          after.progress,
          after.branch,
          after.summary,
          after.blocker,
          after.nextAction,
          after.lastHeartbeatAt,
          after.finishedAt,
          after.updatedAt,
          before.id,
          before.updatedAt,
          before.status,
          before.progress,
          before.lastHeartbeatAt,
        );
      if (update.changes !== 1) return "conflict" as const;

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_run_events (
            id, run_id, sequence, kind, actor, source, summary, before_json,
            after_json, occurred_at, idempotency_key, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.runId,
          eventSequence.sequence,
          event.kind,
          event.actor,
          event.source,
          event.summary,
          JSON.stringify(before),
          JSON.stringify(after),
          event.occurredAt,
          event.idempotencyKey,
          event.correlationId,
        );

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_run_checkpoints (
            id, run_id, event_id, sequence, phase, progress, branch, summary,
            commits_json, tests_status, tests_summary, blockers, next_step,
            captured_at, source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          checkpoint.id,
          checkpoint.runId,
          checkpoint.eventId,
          checkpointSequence.sequence,
          checkpoint.phase,
          checkpoint.progress,
          checkpoint.branch,
          checkpoint.summary,
          JSON.stringify(checkpoint.commits),
          checkpoint.testsStatus,
          checkpoint.testsSummary,
          checkpoint.blockers,
          checkpoint.nextStep,
          checkpoint.capturedAt,
          checkpoint.sourceHash,
        );

      return "recorded" as const;
    });

    return transaction.immediate();
  }
}
