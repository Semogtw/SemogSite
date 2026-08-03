import type {
  ScopeReservationAuditEvent,
  ScopeReservationRepository,
  ScopeReservationSnapshot,
  ScopeReservationStoreResult,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";

type ReservationRow = {
  id: string;
  project_id: string | null;
  repository_id: string;
  run_id: string | null;
  branch: string;
  kind: ScopeReservationSnapshot["kind"];
  patterns_json: string;
  holder_label: string;
  purpose: string;
  state: ScopeReservationSnapshot["state"];
  acquired_at: string;
  renewed_at: string;
  expires_at: string;
  released_at: string | null;
  version: number;
};

type ExistingReservationEvent = {
  id: string;
  action: ScopeReservationAuditEvent["action"];
  actor: string;
  before_json: string | null;
  after_json: string;
  reason: string;
  overlap_ids_json: string;
  occurred_at: string;
  source: ScopeReservationAuditEvent["source"];
  confirmed: number;
  correlation_id: string;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseSnapshot(value: string | null): ScopeReservationSnapshot | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ScopeReservationSnapshot)
      : null;
  } catch {
    return null;
  }
}

function rowToSnapshot(row: ReservationRow): ScopeReservationSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    runId: row.run_id,
    branch: row.branch,
    kind: row.kind,
    patterns: parseStringArray(row.patterns_json),
    holderLabel: row.holder_label,
    purpose: row.purpose,
    state: row.state,
    acquiredAt: row.acquired_at,
    renewedAt: row.renewed_at,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
    version: row.version,
  };
}

function durationSeconds(start: string, end: string): number | null {
  const startEpoch = Date.parse(start);
  const endEpoch = Date.parse(end);
  if (Number.isNaN(startEpoch) || Number.isNaN(endEpoch)) return null;
  return Math.round((endEpoch - startEpoch) / 1_000);
}

function sameSnapshotIntent(
  left: ScopeReservationSnapshot | null,
  right: ScopeReservationSnapshot | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.repositoryId === right.repositoryId &&
    left.runId === right.runId &&
    left.branch === right.branch &&
    left.kind === right.kind &&
    JSON.stringify(left.patterns) === JSON.stringify(right.patterns) &&
    left.holderLabel === right.holderLabel &&
    left.purpose === right.purpose &&
    left.state === right.state &&
    left.version === right.version &&
    durationSeconds(left.renewedAt, left.expiresAt) ===
      durationSeconds(right.renewedAt, right.expiresAt)
  );
}

function sameStoredIntent(
  existing: ExistingReservationEvent,
  audit: ScopeReservationAuditEvent,
): boolean {
  return (
    existing.id === audit.id &&
    existing.action === audit.action &&
    existing.actor === audit.actor &&
    existing.reason === audit.reason &&
    existing.source === audit.source &&
    (existing.confirmed === 1) === audit.confirmed &&
    existing.correlation_id === audit.correlationId &&
    JSON.stringify(parseStringArray(existing.overlap_ids_json)) ===
      JSON.stringify(audit.overlapReservationIds) &&
    sameSnapshotIntent(parseSnapshot(existing.before_json), audit.before) &&
    sameSnapshotIntent(parseSnapshot(existing.after_json), audit.after)
  );
}

function selectEvent(
  database: SqliteDatabase,
  reservationId: string,
  idempotencyKey: string,
): ExistingReservationEvent | undefined {
  return database.$client
    .prepare(
      `SELECT id, action, actor, before_json, after_json, reason,
              overlap_ids_json, occurred_at, source, confirmed, correlation_id
       FROM scope_reservation_events
       WHERE reservation_id = ? AND idempotency_key = ?`,
    )
    .get(reservationId, idempotencyKey) as
    | ExistingReservationEvent
    | undefined;
}

function insertEventAndAudit(
  database: SqliteDatabase,
  sequence: number,
  audit: ScopeReservationAuditEvent,
): void {
  database.$client
    .prepare(
      `INSERT INTO scope_reservation_events (
        id, reservation_id, sequence, action, actor, before_json, after_json,
        reason, overlap_ids_json, occurred_at, source, confirmed,
        idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      audit.id,
      audit.entityId,
      sequence,
      audit.action,
      audit.actor,
      audit.before === null ? null : JSON.stringify(audit.before),
      JSON.stringify(audit.after),
      audit.reason,
      JSON.stringify(audit.overlapReservationIds),
      audit.occurredAt,
      audit.source,
      audit.confirmed ? 1 : 0,
      audit.idempotencyKey,
      audit.correlationId,
    );

  database.$client
    .prepare(
      `INSERT INTO audit_events (
        id, actor, action, entity_type, entity_id, before_json, after_json,
        reason, occurred_at, source, confirmed, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      audit.id,
      audit.actor,
      audit.action,
      audit.entityType,
      audit.entityId,
      audit.before === null ? null : JSON.stringify(audit.before),
      JSON.stringify(audit.after),
      audit.reason,
      audit.occurredAt,
      audit.source,
      audit.confirmed ? 1 : 0,
      audit.correlationId,
    );
}

export class SqliteScopeReservationRepository
  implements ScopeReservationRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async listPotentialOverlaps(
    repositoryId: string,
    branch: string,
    observedAt: string,
  ): Promise<readonly ScopeReservationSnapshot[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT id, project_id, repository_id, run_id, branch, kind,
                patterns_json, holder_label, purpose, state, acquired_at,
                renewed_at, expires_at, released_at, version
         FROM scope_reservations
         WHERE repository_id = ?
           AND branch = ?
           AND state = 'active'
           AND expires_at > ?
         ORDER BY acquired_at ASC, id ASC`,
      )
      .all(repositoryId, branch, observedAt) as ReservationRow[];
    return rows.map(rowToSnapshot);
  }

  async findById(id: string): Promise<ScopeReservationSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, project_id, repository_id, run_id, branch, kind,
                patterns_json, holder_label, purpose, state, acquired_at,
                renewed_at, expires_at, released_at, version
         FROM scope_reservations WHERE id = ?`,
      )
      .get(id) as ReservationRow | undefined;
    return row === undefined ? null : rowToSnapshot(row);
  }

  async acquire(
    reservation: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        audit.action !== "scope_reservation.acquire" ||
        audit.entityType !== "scope_reservation" ||
        audit.entityId !== reservation.id ||
        audit.before !== null ||
        !sameSnapshotIntent(audit.after, reservation)
      ) {
        return "conflict";
      }

      const existingEvent = selectEvent(
        this.database,
        reservation.id,
        audit.idempotencyKey,
      );
      if (existingEvent !== undefined) {
        return sameStoredIntent(existingEvent, audit) ? "duplicate" : "conflict";
      }

      const target = this.database.$client
        .prepare("SELECT id FROM repositories WHERE id = ? AND status = 'active'")
        .get(reservation.repositoryId) as { id: string } | undefined;
      if (target === undefined) return "repository_not_found";

      if (reservation.runId !== null) {
        const run = this.database.$client
          .prepare("SELECT id FROM cooperative_runs WHERE id = ?")
          .get(reservation.runId) as { id: string } | undefined;
        if (run === undefined) return "run_not_found";
      }

      const existingReservation = this.database.$client
        .prepare("SELECT id FROM scope_reservations WHERE id = ?")
        .get(reservation.id) as { id: string } | undefined;
      if (existingReservation !== undefined) return "conflict";

      this.database.$client
        .prepare(
          `INSERT INTO scope_reservations (
            id, project_id, repository_id, run_id, branch, kind,
            patterns_json, holder_label, purpose, state, acquired_at,
            renewed_at, expires_at, released_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reservation.id,
          reservation.projectId,
          reservation.repositoryId,
          reservation.runId,
          reservation.branch,
          reservation.kind,
          JSON.stringify(reservation.patterns),
          reservation.holderLabel,
          reservation.purpose,
          reservation.state,
          reservation.acquiredAt,
          reservation.renewedAt,
          reservation.expiresAt,
          reservation.releasedAt,
          reservation.version,
        );

      insertEventAndAudit(this.database, 1, audit);
      return "created";
    });

    return transaction.immediate();
  }

  async update(
    before: ScopeReservationSnapshot,
    after: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        audit.action === "scope_reservation.acquire" ||
        audit.entityType !== "scope_reservation" ||
        before.id !== after.id ||
        audit.entityId !== after.id ||
        after.version !== before.version + 1 ||
        !sameSnapshotIntent(audit.before, before) ||
        !sameSnapshotIntent(audit.after, after)
      ) {
        return "conflict";
      }

      const existingEvent = selectEvent(
        this.database,
        after.id,
        audit.idempotencyKey,
      );
      if (existingEvent !== undefined) {
        return sameStoredIntent(existingEvent, audit) ? "duplicate" : "conflict";
      }

      const update = this.database.$client
        .prepare(
          `UPDATE scope_reservations
           SET project_id = ?, repository_id = ?, run_id = ?, branch = ?,
               kind = ?, patterns_json = ?, holder_label = ?, purpose = ?,
               state = ?, acquired_at = ?, renewed_at = ?, expires_at = ?,
               released_at = ?, version = ?
           WHERE id = ?
             AND version = ?
             AND state = ?
             AND renewed_at = ?
             AND expires_at = ?
             AND released_at IS ?`,
        )
        .run(
          after.projectId,
          after.repositoryId,
          after.runId,
          after.branch,
          after.kind,
          JSON.stringify(after.patterns),
          after.holderLabel,
          after.purpose,
          after.state,
          after.acquiredAt,
          after.renewedAt,
          after.expiresAt,
          after.releasedAt,
          after.version,
          before.id,
          before.version,
          before.state,
          before.renewedAt,
          before.expiresAt,
          before.releasedAt,
        );
      if (update.changes !== 1) return "conflict";

      const sequenceRow = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM scope_reservation_events WHERE reservation_id = ?`,
        )
        .get(after.id) as { sequence: number };
      insertEventAndAudit(this.database, sequenceRow.sequence, audit);
      return "updated";
    });

    return transaction.immediate();
  }
}
