import type {
  CooperativeRunCommandLifecycleSnapshot,
  CooperativeRunCommandTransitionEvent,
  CooperativeRunCommandTransitionRepository,
  CooperativeRunCommandTransitionStoreResult,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

type CommandRow = {
  id: string;
  run_id: string;
  kind: CooperativeRunCommandLifecycleSnapshot["kind"];
  status: CooperativeRunCommandLifecycleSnapshot["status"];
  summary: string;
  payload_json: string;
  reason: string | null;
  queued_by: string;
  idempotency_key: string;
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

function parsePayload(value: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch {
    return null;
  }
}

function toSnapshot(row: CommandRow): CooperativeRunCommandLifecycleSnapshot | null {
  const payload = parsePayload(row.payload_json);
  if (payload === null) return null;

  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    payload,
    reason: row.reason,
    queuedBy: row.queued_by,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    queuedAt: row.queued_at,
    acknowledgedAt: row.acknowledged_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

function sameSnapshot(
  left: CooperativeRunCommandLifecycleSnapshot,
  right: CooperativeRunCommandLifecycleSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameEventPayload(
  existing: ExistingEventRow,
  event: CooperativeRunCommandTransitionEvent,
): boolean {
  return (
    existing.id === event.id &&
    existing.kind === event.kind &&
    existing.actor === event.actor &&
    existing.source === event.source &&
    existing.summary === event.summary &&
    existing.before_json === JSON.stringify(event.before) &&
    existing.after_json === JSON.stringify(event.after) &&
    existing.occurred_at === event.occurredAt &&
    existing.correlation_id === event.correlationId
  );
}

const commandSelect = `
  SELECT id, run_id, kind, status, summary, payload_json, reason, queued_by,
         idempotency_key, correlation_id, queued_at, acknowledged_at,
         completed_at, expires_at, updated_at
  FROM cooperative_run_commands`;

export class SqliteCooperativeRunCommandTransitionRepository
  implements CooperativeRunCommandTransitionRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findCommand(
    runId: string,
    commandId: string,
  ): Promise<CooperativeRunCommandLifecycleSnapshot | null> {
    const row = this.database.$client
      .prepare(`${commandSelect} WHERE run_id = ? AND id = ?`)
      .get(runId, commandId) as CommandRow | undefined;
    if (row === undefined) return null;
    return toSnapshot(row);
  }

  async apply(
    before: CooperativeRunCommandLifecycleSnapshot,
    after: CooperativeRunCommandLifecycleSnapshot,
    event: CooperativeRunCommandTransitionEvent,
  ): Promise<CooperativeRunCommandTransitionStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        before.id !== after.id ||
        before.runId !== after.runId ||
        before.id !== event.commandId ||
        before.runId !== event.runId ||
        event.before.id !== before.id ||
        event.after.id !== after.id ||
        !sameSnapshot(event.before, before) ||
        !sameSnapshot(event.after, after)
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
        .get(before.runId, event.idempotencyKey) as ExistingEventRow | undefined;

      if (existingEvent !== undefined) {
        const currentRow = this.database.$client
          .prepare(`${commandSelect} WHERE run_id = ? AND id = ?`)
          .get(before.runId, before.id) as CommandRow | undefined;
        const current = currentRow === undefined ? null : toSnapshot(currentRow);
        return sameEventPayload(existingEvent, event) &&
          current !== null &&
          sameSnapshot(current, after)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const sequenceRow = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM cooperative_run_events
           WHERE run_id = ?`,
        )
        .get(before.runId) as { sequence: number };

      const update = this.database.$client
        .prepare(
          `UPDATE cooperative_run_commands
           SET status = ?,
               reason = ?,
               acknowledged_at = ?,
               completed_at = ?,
               updated_at = ?
           WHERE id = ?
             AND run_id = ?
             AND status = ?
             AND updated_at = ?`,
        )
        .run(
          after.status,
          after.reason,
          after.acknowledgedAt,
          after.completedAt,
          after.updatedAt,
          before.id,
          before.runId,
          before.status,
          before.updatedAt,
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
          JSON.stringify(event.before),
          JSON.stringify(event.after),
          event.occurredAt,
          event.idempotencyKey,
          event.correlationId,
        );

      return "updated" as const;
    });

    return transaction.immediate();
  }
}
