import type {
  AttentionLifecycleAuditEvent,
  AttentionLifecycleRepository,
  AttentionLifecycleSnapshot,
  AttentionLifecycleType,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";
import {
  assertD1BatchSucceeded,
  readD1SingleRowChange,
} from "./d1-write-result";

type PersistedAttentionType =
  | "risk"
  | "blocker"
  | "decision"
  | "local_test"
  | "external_dependency"
  | "technical_debt"
  | "security";

type AttentionRow = {
  id: string;
  project_id: string | null;
  type: PersistedAttentionType;
  status: AttentionLifecycleSnapshot["status"];
  impact: AttentionLifecycleSnapshot["impact"];
  title: string;
  owner: AttentionLifecycleSnapshot["owner"];
  next_action: string;
  data_source: AttentionLifecycleSnapshot["source"];
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function toDomainType(type: PersistedAttentionType): AttentionLifecycleType {
  return type === "local_test" ? "critical_test" : type;
}

function toPersistenceType(type: AttentionLifecycleType): PersistedAttentionType {
  return type === "critical_test" ? "local_test" : type;
}


/**
 * Worker-safe attention lifecycle persistence with the same optimistic
 * concurrency contract as the canonical SQLite adapter.
 *
 * The conditional UPDATE and audit INSERT are executed sequentially in one D1
 * batch. SQLite changes() gates the audit row on the immediately preceding CAS
 * changing exactly one row, so a stale transition cannot create false audit.
 */
export class D1AttentionLifecycleRepository
  implements AttentionLifecycleRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async findById(id: string): Promise<AttentionLifecycleSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT
          id, project_id, type, status, impact, title, owner, next_action,
          data_source, resolved_at, created_at, updated_at
        FROM attention_items
        WHERE id = ?
        LIMIT 1`,
      )
      .bind(id)
      .all<AttentionRow>();

    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 attention lifecycle lookup failed.");
    }

    const row = result.results[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      type: toDomainType(row.type),
      status: row.status,
      impact: row.impact,
      title: row.title,
      owner: row.owner,
      nextAction: row.next_action,
      source: row.data_source,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async transitionWithAudit(
    before: AttentionLifecycleSnapshot,
    after: AttentionLifecycleSnapshot,
    audit: AttentionLifecycleAuditEvent,
  ): Promise<boolean> {
    const transition = this.database
      .prepare(
        `UPDATE attention_items
        SET status = ?, type = ?, resolved_at = ?, updated_at = ?
        WHERE id = ? AND status = ? AND updated_at = ?`,
      )
      .bind(
        after.status,
        toPersistenceType(after.type),
        after.resolvedAt,
        after.updatedAt,
        before.id,
        before.status,
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
    assertD1BatchSucceeded(results, "attention lifecycle");

    const changed = readD1SingleRowChange(results[0], "attention lifecycle");
    return changed === 1;
  }
}
