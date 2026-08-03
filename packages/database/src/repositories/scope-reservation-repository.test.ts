import { describe, expect, it } from "vitest";
import type {
  ScopeReservationAuditEvent,
  ScopeReservationSnapshot,
} from "@semogtw/domain/orchestration";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteScopeReservationRepository } from "./scope-reservation-repository";

const now = "2026-08-03T08:00:00.000Z";

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      "Semogtw",
      "SemogSite",
      "Semogtw/SemogSite",
      "product",
      "private",
      "active",
      "main",
      "develop/workflow-control-core",
      "https://github.com/Semogtw/SemogSite",
      "manual",
      now,
      now,
    );
}

function reservation(
  overrides: Partial<ScopeReservationSnapshot> = {},
): ScopeReservationSnapshot {
  return {
    id: "reservation-1",
    projectId: "demo-project-platform",
    repositoryId: "repository-1",
    runId: null,
    branch: "develop/workflow-control-core",
    kind: "directory",
    patterns: ["packages/domain/**"],
    holderLabel: "agent-a",
    purpose: "Implement orchestration domain services.",
    state: "active",
    acquiredAt: now,
    renewedAt: now,
    expiresAt: "2026-08-03T09:00:00.000Z",
    releasedAt: null,
    version: 1,
    ...overrides,
  };
}

function audit(
  after: ScopeReservationSnapshot,
  overrides: Partial<ScopeReservationAuditEvent> = {},
): ScopeReservationAuditEvent {
  return {
    id: "audit-reservation-1",
    actor: "owner-1",
    action: "scope_reservation.acquire",
    entityType: "scope_reservation",
    entityId: after.id,
    before: null,
    after,
    reason: after.purpose,
    overlapReservationIds: [],
    occurredAt: now,
    source: "agent",
    confirmed: false,
    idempotencyKey: "reservation-attempt-1",
    correlationId: "reservation-correlation-1",
    ...overrides,
  };
}

describe("SqliteScopeReservationRepository", () => {
  it("acquires a reservation with immutable event and audit records", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteScopeReservationRepository(database);
    const value = reservation();
    const event = audit(value);

    await expect(repository.acquire(value, event)).resolves.toBe("created");

    expect(
      database.$client
        .prepare(
          `SELECT repository_id, run_id, branch, kind, patterns_json,
                  holder_label, purpose, state, acquired_at, renewed_at,
                  expires_at, released_at, version
           FROM scope_reservations WHERE id = ?`,
        )
        .get(value.id),
    ).toEqual({
      repository_id: "repository-1",
      run_id: null,
      branch: value.branch,
      kind: "directory",
      patterns_json: JSON.stringify(value.patterns),
      holder_label: "agent-a",
      purpose: value.purpose,
      state: "active",
      acquired_at: now,
      renewed_at: now,
      expires_at: value.expiresAt,
      released_at: null,
      version: 1,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, action, actor, before_json, after_json, reason,
                  overlap_ids_json, idempotency_key, correlation_id
           FROM scope_reservation_events WHERE reservation_id = ?`,
        )
        .get(value.id),
    ).toEqual({
      sequence: 1,
      action: "scope_reservation.acquire",
      actor: "owner-1",
      before_json: null,
      after_json: JSON.stringify(value),
      reason: value.purpose,
      overlap_ids_json: "[]",
      idempotency_key: "reservation-attempt-1",
      correlation_id: "reservation-correlation-1",
    });
    expect(
      database.$client
        .prepare(
          "SELECT action, entity_type, entity_id FROM audit_events WHERE id = ?",
        )
        .get(event.id),
    ).toEqual({
      action: "scope_reservation.acquire",
      entity_type: "scope_reservation",
      entity_id: value.id,
    });

    await expect(
      repository.listPotentialOverlaps(
        "repository-1",
        "develop/workflow-control-core",
        "2026-08-03T08:30:00.000Z",
      ),
    ).resolves.toEqual([value]);
    database.$client.close();
  });

  it("deduplicates stable acquire intent and rejects changed reuse", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteScopeReservationRepository(database);
    const value = reservation();
    const event = audit(value);

    await repository.acquire(value, event);
    await expect(repository.acquire(value, event)).resolves.toBe("duplicate");
    await expect(
      repository.acquire(
        { ...value, purpose: "Different purpose" },
        { ...event, after: { ...value, purpose: "Different purpose" } },
      ),
    ).resolves.toBe("conflict");

    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM scope_reservations")
        .get(),
    ).toEqual({ count: 1 });
    database.$client.close();
  });

  it("updates with compare-and-swap and appends the next event", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteScopeReservationRepository(database);
    const before = reservation();
    await repository.acquire(before, audit(before));

    const after: ScopeReservationSnapshot = {
      ...before,
      renewedAt: "2026-08-03T08:30:00.000Z",
      expiresAt: "2026-08-03T10:30:00.000Z",
      version: 2,
    };
    const renewal = audit(after, {
      id: "audit-reservation-renew",
      action: "scope_reservation.renew",
      before,
      after,
      reason: "Renew active scope reservation.",
      occurredAt: after.renewedAt,
      idempotencyKey: "reservation-renew-1",
    });

    await expect(repository.update(before, after, renewal)).resolves.toBe(
      "updated",
    );
    await expect(repository.update(before, after, renewal)).resolves.toBe(
      "duplicate",
    );
    expect(
      database.$client
        .prepare(
          `SELECT renewed_at, expires_at, version
           FROM scope_reservations WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      renewed_at: after.renewedAt,
      expires_at: after.expiresAt,
      version: 2,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, action FROM scope_reservation_events
           WHERE reservation_id = ? ORDER BY sequence ASC`,
        )
        .all(before.id),
    ).toEqual([
      { sequence: 1, action: "scope_reservation.acquire" },
      { sequence: 2, action: "scope_reservation.renew" },
    ]);

    const staleBefore = { ...before, version: 1 };
    const conflictingAfter = { ...after, version: 3 };
    await expect(
      repository.update(
        staleBefore,
        conflictingAfter,
        audit(conflictingAfter, {
          id: "audit-stale",
          action: "scope_reservation.renew",
          before: staleBefore,
          after: conflictingAfter,
          idempotencyKey: "reservation-renew-stale",
        }),
      ),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("reports missing repository and run references without partial inserts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteScopeReservationRepository(database);

    const missingRepository = reservation();
    await expect(
      repository.acquire(missingRepository, audit(missingRepository)),
    ).resolves.toBe("repository_not_found");

    insertRepository(database);
    const missingRun = reservation({ id: "reservation-run", runId: "run-missing" });
    await expect(
      repository.acquire(
        missingRun,
        audit(missingRun, {
          id: "audit-reservation-run",
          entityId: missingRun.id,
          idempotencyKey: "reservation-run-attempt",
        }),
      ),
    ).resolves.toBe("run_not_found");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM scope_reservations")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });
});
