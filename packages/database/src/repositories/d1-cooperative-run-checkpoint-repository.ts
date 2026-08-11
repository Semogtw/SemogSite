import type {
  CooperativeRunCheckpoint,
  CooperativeRunCheckpointEvent,
  CooperativeRunCheckpointRepository,
  CooperativeRunCheckpointStoreResult,
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
  event_id: string;
  event_kind: CooperativeRunCheckpointEvent["kind"];
  event_actor: string;
  event_source: CooperativeRunCheckpointEvent["source"];
  event_summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
  checkpoint_id: string | null;
  checkpoint_run_id: string | null;
  checkpoint_event_id: string | null;
  checkpoint_phase: string | null;
  checkpoint_progress: number | null;
  checkpoint_branch: string | null;
  checkpoint_summary: string | null;
  commits_json: string | null;
  tests_status: string | null;
  tests_summary: string | null;
  blockers: string | null;
  next_step: string | null;
  captured_at: string | null;
  source_hash: string | null;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 cooperative run checkpoint batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 cooperative run checkpoint result is missing changes metadata.",
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
  before: CooperativeRunSnapshot,
  after: CooperativeRunSnapshot,
  event: CooperativeRunCheckpointEvent,
  checkpoint: CooperativeRunCheckpoint,
): boolean {
  return (
    existing.event_id === event.id &&
    existing.event_kind === event.kind &&
    existing.event_actor === event.actor &&
    existing.event_source === event.source &&
    existing.event_summary === event.summary &&
    existing.before_json === JSON.stringify(before) &&
    existing.after_json === JSON.stringify(after) &&
    existing.occurred_at === event.occurredAt &&
    existing.correlation_id === event.correlationId &&
    existing.checkpoint_id === checkpoint.id &&
    existing.checkpoint_run_id === checkpoint.runId &&
    existing.checkpoint_event_id === checkpoint.eventId &&
    existing.checkpoint_phase === checkpoint.phase &&
    existing.checkpoint_progress === checkpoint.progress &&
    existing.checkpoint_branch === checkpoint.branch &&
    existing.checkpoint_summary === checkpoint.summary &&
    existing.commits_json === JSON.stringify(checkpoint.commits) &&
    existing.tests_status === checkpoint.testsStatus &&
    existing.tests_summary === checkpoint.testsSummary &&
    existing.blockers === checkpoint.blockers &&
    existing.next_step === checkpoint.nextStep &&
    existing.captured_at === checkpoint.capturedAt &&
    existing.source_hash === checkpoint.sourceHash
  );
}

export class D1CooperativeRunCheckpointRepository
  implements CooperativeRunCheckpointRepository
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
      throw new Error("D1 cooperative run checkpoint lookup failed.");
    }

    const row = result.results[0];
    return row === undefined ? null : toSnapshot(row);
  }

  async record(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunCheckpointEvent,
    checkpoint: CooperativeRunCheckpoint,
  ): Promise<CooperativeRunCheckpointStoreResult> {
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
      return "conflict";
    }

    const update = this.database
      .prepare(
        `UPDATE cooperative_runs
        SET
          status = ?, phase = ?, progress = ?, branch = ?, summary = ?,
          blocker = ?, next_action = ?, last_heartbeat_at = ?, finished_at = ?,
          updated_at = ?
        WHERE id = ?
          AND updated_at = ?
          AND status = ?
          AND progress = ?
          AND last_heartbeat_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM cooperative_run_events
            WHERE run_id = ? AND idempotency_key = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM cooperative_run_checkpoints
            WHERE source_hash = ?
          )`,
      )
      .bind(
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
        before.id,
        event.idempotencyKey,
        checkpoint.sourceHash,
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
          ?, ?, ?, ?, ?, ?, ?, ?, ?
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
        JSON.stringify(before),
        JSON.stringify(after),
        event.occurredAt,
        event.idempotencyKey,
        event.correlationId,
      );

    const insertCheckpoint = this.database
      .prepare(
        `INSERT INTO cooperative_run_checkpoints (
          id, run_id, event_id, sequence, phase, progress, branch, summary,
          commits_json, tests_status, tests_summary, blockers, next_step,
          captured_at, source_hash
        )
        SELECT
          ?, ?, ?,
          COALESCE((SELECT MAX(sequence) FROM cooperative_run_checkpoints WHERE run_id = ?), 0) + 1,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        checkpoint.id,
        checkpoint.runId,
        checkpoint.eventId,
        checkpoint.runId,
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

    const results = await this.database.batch([
      update,
      insertEvent,
      insertCheckpoint,
    ]);
    assertBatchSucceeded(results);

    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 cooperative run checkpoint changed multiple runs.");
    }
    if (changed === 1) {
      if (readChangeCount(results[1]) !== 1 || readChangeCount(results[2]) !== 1) {
        throw new Error("D1 cooperative run checkpoint batch was incomplete.");
      }
      return "recorded";
    }

    const existing = await this.database
      .prepare(
        `SELECT
          event.id AS event_id,
          event.kind AS event_kind,
          event.actor AS event_actor,
          event.source AS event_source,
          event.summary AS event_summary,
          event.before_json,
          event.after_json,
          event.occurred_at,
          event.correlation_id,
          checkpoint.id AS checkpoint_id,
          checkpoint.run_id AS checkpoint_run_id,
          checkpoint.event_id AS checkpoint_event_id,
          checkpoint.phase AS checkpoint_phase,
          checkpoint.progress AS checkpoint_progress,
          checkpoint.branch AS checkpoint_branch,
          checkpoint.summary AS checkpoint_summary,
          checkpoint.commits_json,
          checkpoint.tests_status,
          checkpoint.tests_summary,
          checkpoint.blockers,
          checkpoint.next_step,
          checkpoint.captured_at,
          checkpoint.source_hash
        FROM cooperative_run_events AS event
        LEFT JOIN cooperative_run_checkpoints AS checkpoint
          ON checkpoint.event_id = event.id
        WHERE event.run_id = ? AND event.idempotency_key = ?
        LIMIT 1`,
      )
      .bind(before.id, event.idempotencyKey)
      .first<ExistingReplayRow>();

    if (
      existing !== null &&
      sameStoredIntent(existing, before, after, event, checkpoint)
    ) {
      return "duplicate";
    }
    return "conflict";
  }
}
