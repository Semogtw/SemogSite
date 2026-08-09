import type {
  CooperativeRunEvent,
  CooperativeRunSnapshot,
  CooperativeRunTransitionRepository,
  CooperativeRunTransitionStoreResult,
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

type ExistingRunEvent = {
  id: string;
  kind: CooperativeRunEvent["kind"];
  actor: string;
  source: CooperativeRunEvent["source"];
  summary: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 cooperative run transition batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 cooperative run transition result is missing changes metadata.",
    );
  }
  return changes;
}

function sameStoredIntent(
  existing: ExistingRunEvent,
  before: CooperativeRunSnapshot,
  after: CooperativeRunSnapshot,
  event: CooperativeRunEvent,
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

export class D1CooperativeRunTransitionRepository
  implements CooperativeRunTransitionRepository
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
      throw new Error("D1 cooperative run lookup failed.");
    }

    const row = result.results[0];
    return row === undefined ? null : toSnapshot(row);
  }

  async apply(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunEvent,
  ): Promise<CooperativeRunTransitionStoreResult> {
    if (
      before.id !== after.id ||
      before.id !== event.runId ||
      event.before.id !== before.id ||
      event.after.id !== after.id
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

    const results = await this.database.batch([update, insertEvent]);
    assertBatchSucceeded(results);

    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 cooperative run transition changed multiple runs.");
    }
    if (changed === 1) return "updated";

    const existing = await this.database
      .prepare(
        `SELECT id, kind, actor, source, summary, before_json, after_json,
                occurred_at, correlation_id
        FROM cooperative_run_events
        WHERE run_id = ? AND idempotency_key = ?
        LIMIT 1`,
      )
      .bind(before.id, event.idempotencyKey)
      .first<ExistingRunEvent>();

    if (existing !== null && sameStoredIntent(existing, before, after, event)) {
      return "duplicate";
    }
    return "conflict";
  }
}
