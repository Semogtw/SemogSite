import type {
  CooperativeRunCommandInboxRepository,
  CooperativeRunCommandLifecycleSnapshot,
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

function parsePayload(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("RUN_COMMAND_PAYLOAD_INVALID");
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_COMMAND_PAYLOAD_INVALID") {
      throw error;
    }
    throw new Error("RUN_COMMAND_PAYLOAD_INVALID");
  }
}

export class SqliteCooperativeRunCommandInboxRepository
  implements CooperativeRunCommandInboxRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async listPending(input: {
    runId: string;
    observedAt: string;
    limit: number;
  }): Promise<readonly CooperativeRunCommandLifecycleSnapshot[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT id, run_id, kind, status, summary, payload_json, reason,
                queued_by, idempotency_key, correlation_id, queued_at,
                acknowledged_at, completed_at, expires_at, updated_at
         FROM cooperative_run_commands
         WHERE run_id = ?
           AND status = 'queued'
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY queued_at ASC, id ASC
         LIMIT ?`,
      )
      .all(input.runId, input.observedAt, input.limit) as CommandRow[];

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      kind: row.kind,
      status: row.status,
      summary: row.summary,
      payload: parsePayload(row.payload_json),
      reason: row.reason,
      queuedBy: row.queued_by,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      queuedAt: row.queued_at,
      acknowledgedAt: row.acknowledged_at,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    }));
  }
}
