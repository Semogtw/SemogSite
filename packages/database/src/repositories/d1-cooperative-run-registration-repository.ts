import type {
  CooperativeRunRegistrationEvent,
  CooperativeRunRegistrationRepository,
  CooperativeRunRegistrationStoreResult,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

type ExistingRegistrationEvent = {
  id: string;
  actor: string;
  source: string;
  summary: string;
  after_json: string | null;
  correlation_id: string;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 cooperative run registration batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 cooperative run registration result is missing changes metadata.",
    );
  }
  return changes;
}

function parseRun(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function sameRegistrationIntent(
  existing: ExistingRegistrationEvent,
  run: CooperativeRunSnapshot,
  event: CooperativeRunRegistrationEvent,
): boolean {
  const after = parseRun(existing.after_json);
  if (after === null) return false;
  return (
    existing.id === event.id &&
    existing.actor === event.actor &&
    existing.source === event.source &&
    existing.summary === event.summary &&
    existing.correlation_id === event.correlationId &&
    after.id === run.id &&
    after.projectId === run.projectId &&
    after.title === run.title &&
    after.actorLabel === run.actorLabel &&
    after.origin === run.origin &&
    after.status === run.status &&
    after.phase === run.phase &&
    after.progress === run.progress &&
    after.branch === run.branch &&
    after.summary === run.summary &&
    after.blocker === run.blocker &&
    after.nextAction === run.nextAction &&
    after.finishedAt === run.finishedAt &&
    after.staleAfterSeconds === run.staleAfterSeconds
  );
}

/**
 * Registers a cooperative run and its first ledger event as one D1 batch.
 * The event is inserted only when the immediately preceding run INSERT changed
 * one row. A zero-row insert is classified from the final state, preserving
 * semantic idempotency instead of treating any repeated key as a duplicate.
 */
export class D1CooperativeRunRegistrationRepository
  implements CooperativeRunRegistrationRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async register(
    run: CooperativeRunSnapshot,
    event: CooperativeRunRegistrationEvent,
  ): Promise<CooperativeRunRegistrationStoreResult> {
    if (event.runId !== run.id) return "conflict";

    const insertRun = this.database
      .prepare(
        `INSERT INTO cooperative_runs (
          id, project_id, title, actor_label, origin, status, phase, progress,
          branch, summary, blocker, next_action, started_at, last_heartbeat_at,
          finished_at, stale_after_seconds, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (? IS NULL OR EXISTS (
          SELECT 1 FROM projects WHERE id = ? AND status <> 'archived'
        ))
          AND NOT EXISTS (SELECT 1 FROM cooperative_runs WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM cooperative_run_events
            WHERE run_id = ? AND idempotency_key = ?
          )`,
      )
      .bind(
        run.id,
        run.projectId,
        run.title,
        run.actorLabel,
        run.origin,
        run.status,
        run.phase,
        run.progress,
        run.branch,
        run.summary,
        run.blocker,
        run.nextAction,
        run.startedAt,
        run.lastHeartbeatAt,
        run.finishedAt,
        run.staleAfterSeconds,
        run.startedAt,
        run.updatedAt,
        run.projectId,
        run.projectId,
        run.id,
        run.id,
        event.idempotencyKey,
      );

    const insertEvent = this.database
      .prepare(
        `INSERT INTO cooperative_run_events (
          id, run_id, sequence, kind, actor, source, summary, before_json,
          after_json, occurred_at, idempotency_key, correlation_id
        )
        SELECT ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        event.id,
        event.runId,
        event.kind,
        event.actor,
        event.source,
        event.summary,
        JSON.stringify(run),
        event.occurredAt,
        event.idempotencyKey,
        event.correlationId,
      );

    const results = await this.database.batch([insertRun, insertEvent]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 cooperative run registration inserted multiple runs.");
    }
    if (changed === 1) return "created";

    const replay = await this.database
      .prepare(
        `SELECT id, actor, source, summary, after_json, correlation_id
        FROM cooperative_run_events
        WHERE run_id = ? AND idempotency_key = ?
        LIMIT 1`,
      )
      .bind(run.id, event.idempotencyKey)
      .first<ExistingRegistrationEvent>();
    if (replay !== null) {
      return sameRegistrationIntent(replay, run, event) ? "duplicate" : "conflict";
    }

    if (run.projectId !== null) {
      const project = await this.database
        .prepare(
          "SELECT id FROM projects WHERE id = ? AND status <> 'archived' LIMIT 1",
        )
        .bind(run.projectId)
        .first<{ id: string }>();
      if (project === null) return "project_not_found";
    }

    return "conflict";
  }
}
