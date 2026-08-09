import type {
  ScopeReservationAuditEvent,
  ScopeReservationRepository,
  ScopeReservationSnapshot,
  ScopeReservationStoreResult,
} from "@semogtw/domain/orchestration";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

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
  confirmed: number | boolean;
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

function toSnapshot(row: ReservationRow): ScopeReservationSnapshot {
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
    (existing.confirmed === true || existing.confirmed === 1) === audit.confirmed &&
    existing.correlation_id === audit.correlationId &&
    JSON.stringify(parseStringArray(existing.overlap_ids_json)) ===
      JSON.stringify(audit.overlapReservationIds) &&
    sameSnapshotIntent(parseSnapshot(existing.before_json), audit.before) &&
    sameSnapshotIntent(parseSnapshot(existing.after_json), audit.after)
  );
}

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) throw new Error("D1 scope reservation batch failed.");
}

function readChangeCount(result: D1QueryResult | undefined, operation: string): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(`D1 scope reservation ${operation} is missing changes metadata.`);
  }
  return changes;
}

export class D1ScopeReservationRepository implements ScopeReservationRepository {
  constructor(private readonly database: D1DatabaseBinding) {}

  async listPotentialOverlaps(
    repositoryId: string,
    branch: string,
    observedAt: string,
  ): Promise<readonly ScopeReservationSnapshot[]> {
    const result = await this.database
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
      .bind(repositoryId, branch, observedAt)
      .all<ReservationRow>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 scope reservation overlap lookup failed.");
    }
    return result.results.map(toSnapshot);
  }

  async findById(id: string): Promise<ScopeReservationSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT id, project_id, repository_id, run_id, branch, kind,
                patterns_json, holder_label, purpose, state, acquired_at,
                renewed_at, expires_at, released_at, version
         FROM scope_reservations WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .all<ReservationRow>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 scope reservation lookup failed.");
    }
    const row = result.results[0];
    return row === undefined ? null : toSnapshot(row);
  }

  async acquire(
    reservation: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
    if (
      audit.action !== "scope_reservation.acquire" ||
      audit.entityType !== "scope_reservation" ||
      audit.entityId !== reservation.id ||
      audit.before !== null ||
      !sameSnapshotIntent(audit.after, reservation)
    ) {
      return "conflict";
    }

    const insert = this.database
      .prepare(
        `INSERT INTO scope_reservations (
          id, project_id, repository_id, run_id, branch, kind, patterns_json,
          holder_label, purpose, state, acquired_at, renewed_at, expires_at,
          released_at, version
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM repositories WHERE id = ? AND status = 'active'
        )
          AND (? IS NULL OR EXISTS (SELECT 1 FROM cooperative_runs WHERE id = ?))
          AND NOT EXISTS (SELECT 1 FROM scope_reservations WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM scope_reservation_events
            WHERE reservation_id = ? AND idempotency_key = ?
          )`,
      )
      .bind(
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
        reservation.repositoryId,
        reservation.runId,
        reservation.runId,
        reservation.id,
        reservation.id,
        audit.idempotencyKey,
      );
    const [event, genericAudit] = this.ledgerStatements(audit, 1);
    const results = await this.database.batch([insert, event, genericAudit]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0], "acquire");
    if (changed > 1) throw new Error("D1 scope reservation inserted multiple rows.");
    if (changed === 1) {
      this.assertLedgerWritten(results);
      return "created";
    }

    const existing = await this.selectEvent(reservation.id, audit.idempotencyKey);
    if (existing !== null) {
      return sameStoredIntent(existing, audit) ? "duplicate" : "conflict";
    }
    if (!(await this.exists("repositories", reservation.repositoryId, true))) {
      return "repository_not_found";
    }
    if (
      reservation.runId !== null &&
      !(await this.exists("cooperative_runs", reservation.runId, false))
    ) {
      return "run_not_found";
    }
    return "conflict";
  }

  async update(
    before: ScopeReservationSnapshot,
    after: ScopeReservationSnapshot,
    audit: ScopeReservationAuditEvent,
  ): Promise<ScopeReservationStoreResult> {
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

    const update = this.database
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
           AND released_at IS ?
           AND NOT EXISTS (
             SELECT 1 FROM scope_reservation_events
             WHERE reservation_id = ? AND idempotency_key = ?
           )`,
      )
      .bind(
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
        after.id,
        audit.idempotencyKey,
      );

    const event = this.database
      .prepare(
        `INSERT INTO scope_reservation_events (
          id, reservation_id, sequence, action, actor, before_json, after_json,
          reason, overlap_ids_json, occurred_at, source, confirmed,
          idempotency_key, correlation_id
        )
        SELECT ?, ?,
          COALESCE((SELECT MAX(sequence) FROM scope_reservation_events WHERE reservation_id = ?), 0) + 1,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.entityId,
        audit.entityId,
        audit.action,
        audit.actor,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        JSON.stringify(audit.overlapReservationIds),
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.idempotencyKey,
        audit.correlationId,
      );
    const genericAudit = this.auditStatement(audit);
    const results = await this.database.batch([update, event, genericAudit]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0], "update");
    if (changed > 1) throw new Error("D1 scope reservation updated multiple rows.");
    if (changed === 1) {
      this.assertLedgerWritten(results);
      return "updated";
    }

    const existing = await this.selectEvent(after.id, audit.idempotencyKey);
    if (existing !== null && sameStoredIntent(existing, audit)) return "duplicate";
    return "conflict";
  }

  private ledgerStatements(
    audit: ScopeReservationAuditEvent,
    sequence: number,
  ): readonly [
    ReturnType<D1DatabaseBinding["prepare"]>,
    ReturnType<D1DatabaseBinding["prepare"]>,
  ] {
    const event = this.database
      .prepare(
        `INSERT INTO scope_reservation_events (
          id, reservation_id, sequence, action, actor, before_json, after_json,
          reason, overlap_ids_json, occurred_at, source, confirmed,
          idempotency_key, correlation_id
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
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
    return [event, this.auditStatement(audit)];
  }

  private auditStatement(audit: ScopeReservationAuditEvent) {
    return this.database
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
        audit.before === null ? null : JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );
  }

  private assertLedgerWritten(results: readonly D1QueryResult[]): void {
    if (
      readChangeCount(results[1], "event insert") !== 1 ||
      readChangeCount(results[2], "audit insert") !== 1
    ) {
      throw new Error("D1 scope reservation ledger is incomplete.");
    }
  }

  private async selectEvent(
    reservationId: string,
    idempotencyKey: string,
  ): Promise<ExistingReservationEvent | null> {
    const result = await this.database
      .prepare(
        `SELECT id, action, actor, before_json, after_json, reason,
                overlap_ids_json, occurred_at, source, confirmed, correlation_id
         FROM scope_reservation_events
         WHERE reservation_id = ? AND idempotency_key = ?
         LIMIT 1`,
      )
      .bind(reservationId, idempotencyKey)
      .all<ExistingReservationEvent>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 scope reservation event lookup failed.");
    }
    return result.results[0] ?? null;
  }

  private async exists(
    table: "repositories" | "cooperative_runs",
    id: string,
    activeOnly: boolean,
  ): Promise<boolean> {
    const sql = activeOnly
      ? `SELECT id FROM ${table} WHERE id = ? AND status = 'active' LIMIT 1`
      : `SELECT id FROM ${table} WHERE id = ? LIMIT 1`;
    const result = await this.database.prepare(sql).bind(id).all<{ id: string }>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 scope reservation reference lookup failed.");
    }
    return result.results.length > 0;
  }
}
