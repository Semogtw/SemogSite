import type {
  StageCompletionAuditEvent,
  StageCompletionRepository,
  StageSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

type StageRow = {
  id: string;
  project_id: string;
  title: string;
  state: StageSnapshot["state"];
  progress: number;
  done: number | boolean;
  next_step: string | null;
  blocker: string | null;
  manual_lock: number | boolean;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  status: StageSnapshot["evidence"][number]["status"];
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 stage completion batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error("D1 stage completion result is missing changes metadata.");
  }
  return changes;
}

/**
 * Worker-safe stage completion persistence preserving the SQLite repository's
 * optimistic concurrency contract.
 *
 * The first batch statement performs the same id/state/updated_at CAS as the
 * local SQLite adapter. The audit INSERT is guarded by SQLite changes(), so it
 * executes only when that immediately preceding UPDATE changed exactly one row.
 * D1 batches are transactional and sequential, preventing an unaudited
 * transition or an audit event for a lost race.
 */
export class D1StageCompletionRepository implements StageCompletionRepository {
  constructor(private readonly database: D1DatabaseBinding) {}

  async findById(id: string): Promise<StageSnapshot | null> {
    const stageResult = await this.database
      .prepare(
        `SELECT
          id, project_id, title, state, progress, done, next_step, blocker,
          manual_lock, updated_at
        FROM stages
        WHERE id = ?
        LIMIT 1`,
      )
      .bind(id)
      .all<StageRow>();

    if (stageResult.success === false || (stageResult.error?.length ?? 0) > 0) {
      throw new Error("D1 stage lookup failed.");
    }

    const row = stageResult.results[0];
    if (row === undefined) return null;

    const evidenceResult = await this.database
      .prepare(
        `SELECT id, status
        FROM evidence
        WHERE stage_id = ?`,
      )
      .bind(id)
      .all<EvidenceRow>();

    if (
      evidenceResult.success === false ||
      (evidenceResult.error?.length ?? 0) > 0
    ) {
      throw new Error("D1 stage evidence lookup failed.");
    }

    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      state: row.state,
      progress: row.progress,
      done: Boolean(row.done),
      nextStep: row.next_step,
      blocker: row.blocker,
      evidence: evidenceResult.results.map((item) => ({
        id: item.id,
        status: item.status,
      })),
      manualLock: Boolean(row.manual_lock),
      updatedAt: row.updated_at,
    };
  }

  async completeWithAudit(
    before: StageSnapshot,
    after: StageSnapshot,
    audit: StageCompletionAuditEvent,
  ): Promise<boolean> {
    const transition = this.database
      .prepare(
        `UPDATE stages
        SET
          state = ?,
          progress = ?,
          done = ?,
          next_step = ?,
          blocker = ?,
          manual_lock = ?,
          updated_from = 'manual',
          updated_at = ?
        WHERE id = ? AND state = ? AND updated_at = ?`,
      )
      .bind(
        after.state,
        after.progress,
        after.done ? 1 : 0,
        after.nextStep,
        after.blocker,
        after.manualLock ? 1 : 0,
        after.updatedAt,
        before.id,
        before.state,
        before.updatedAt,
      );

    const auditInsert = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([transition, auditInsert]);
    assertBatchSucceeded(results);

    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 stage completion CAS changed more than one row.");
    }
    return changed === 1;
  }
}
