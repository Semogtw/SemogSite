import type {
  CooperativeRunRegistrationEvent,
  CooperativeRunRegistrationRepository,
  CooperativeRunRegistrationStoreResult,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

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
        | {
            id: string;
            actor: string;
            source: string;
            summary: string;
            after_json: string | null;
            occurred_at: string;
            correlation_id: string;
          }
        | undefined;
      if (existingIdempotency !== undefined) {
        const samePayload =
          existingIdempotency.id === event.id &&
          existingIdempotency.actor === event.actor &&
          existingIdempotency.source === event.source &&
          existingIdempotency.summary === event.summary &&
          existingIdempotency.after_json === JSON.stringify(run) &&
          existingIdempotency.occurred_at === event.occurredAt &&
          existingIdempotency.correlation_id === event.correlationId;
        return samePayload ? "duplicate" : "conflict";
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
