import type {
  CooperativeRunEvent,
  CooperativeRunSnapshot,
  CooperativeRunTransitionRepository,
  CooperativeRunTransitionStoreResult,
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

export class SqliteCooperativeRunTransitionRepository
  implements CooperativeRunTransitionRepository
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

  async apply(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunEvent,
  ): Promise<CooperativeRunTransitionStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        before.id !== after.id ||
        before.id !== event.runId ||
        event.before.id !== before.id ||
        event.after.id !== after.id
      ) {
        return "conflict" as const;
      }

      const existing = this.database.$client
        .prepare(
          `SELECT id, kind, actor, source, summary, before_json, after_json,
                  occurred_at, correlation_id
           FROM cooperative_run_events
           WHERE run_id = ? AND idempotency_key = ?`,
        )
        .get(before.id, event.idempotencyKey) as
        | {
            id: string;
            kind: string;
            actor: string;
            source: string;
            summary: string;
            before_json: string | null;
            after_json: string | null;
            occurred_at: string;
            correlation_id: string;
          }
        | undefined;

      if (existing !== undefined) {
        const samePayload =
          existing.id === event.id &&
          existing.kind === event.kind &&
          existing.actor === event.actor &&
          existing.source === event.source &&
          existing.summary === event.summary &&
          existing.before_json === JSON.stringify(before) &&
          existing.after_json === JSON.stringify(after) &&
          existing.occurred_at === event.occurredAt &&
          existing.correlation_id === event.correlationId;
        return samePayload ? ("duplicate" as const) : ("conflict" as const);
      }

      const sequenceRow = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM cooperative_run_events
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
          sequenceRow.sequence,
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

      return "updated" as const;
    });

    return transaction.immediate();
  }
}
