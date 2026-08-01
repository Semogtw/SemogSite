import type {
  CooperativeRunRegistrationEvent,
  CooperativeRunRegistrationRepository,
  CooperativeRunRegistrationStoreResult,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

type ExistingRegistrationEvent = {
  id: string;
  actor: string;
  source: string;
  summary: string;
  after_json: string | null;
  occurred_at: string;
  correlation_id: string;
};

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

export class SqliteCooperativeRunRegistrationRepository
  implements CooperativeRunRegistrationRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async register(
    run: CooperativeRunSnapshot,
    event: CooperativeRunRegistrationEvent,
  ): Promise<CooperativeRunRegistrationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (event.runId !== run.id) return "conflict";

      const existingIdempotency = this.database.$client
        .prepare(
          `SELECT id, actor, source, summary, after_json, occurred_at,
                  correlation_id
           FROM cooperative_run_events
           WHERE run_id = ? AND idempotency_key = ?`,
        )
        .get(run.id, event.idempotencyKey) as
        | ExistingRegistrationEvent
        | undefined;
      if (existingIdempotency !== undefined) {
        return sameRegistrationIntent(existingIdempotency, run, event)
          ? "duplicate"
          : "conflict";
      }

      if (run.projectId !== null) {
        const project = this.database.$client
          .prepare(
            "SELECT id FROM projects WHERE id = ? AND status <> 'archived'",
          )
          .get(run.projectId) as { id: string } | undefined;
        if (project === undefined) return "project_not_found";
      }

      const existingRun = this.database.$client
        .prepare("SELECT id FROM cooperative_runs WHERE id = ?")
        .get(run.id) as { id: string } | undefined;
      if (existingRun !== undefined) return "conflict";

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_runs (
            id, project_id, title, actor_label, origin, status, phase,
            progress, branch, summary, blocker, next_action, started_at,
            last_heartbeat_at, finished_at, stale_after_seconds, created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
        );

      this.database.$client
        .prepare(
          `INSERT INTO cooperative_run_events (
            id, run_id, sequence, kind, actor, source, summary, before_json,
            after_json, occurred_at, idempotency_key, correlation_id
          ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
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

      return "created";
    });

    return transaction.immediate();
  }
}
