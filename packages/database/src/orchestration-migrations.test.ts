import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./adapters/sqlite";

describe("workflow orchestration migrations", () => {
  it("creates scope reservations and their idempotent event history", () => {
    const database = createSqliteDatabase(":memory:");

    migrate(database);

    expect(
      database.$client
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'scope_reservations',
             'scope_reservation_events'
           )
           ORDER BY name ASC`,
        )
        .all(),
    ).toEqual([
      { name: "scope_reservation_events" },
      { name: "scope_reservations" },
    ]);

    const reservationColumns = new Set(
      database.$client
        .prepare("PRAGMA table_info(scope_reservations)")
        .all()
        .map((row) => (row as { name: string }).name),
    );
    for (const column of [
      "repository_id",
      "run_id",
      "branch",
      "kind",
      "patterns_json",
      "holder_label",
      "purpose",
      "state",
      "acquired_at",
      "renewed_at",
      "expires_at",
      "released_at",
      "version",
    ]) {
      expect(reservationColumns.has(column)).toBe(true);
    }

    const migration = database.$client
      .prepare(
        "SELECT name FROM _semogtw_migrations WHERE name = '0011_scope_reservations.sql'",
      )
      .get();
    expect(migration).toEqual({ name: "0011_scope_reservations.sql" });

    database.$client.close();
  });

  it("creates verification obligations with exact commit validity and event history", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    expect(
      database.$client
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'verification_obligations',
             'verification_obligation_events'
           )
           ORDER BY name ASC`,
        )
        .all(),
    ).toEqual([
      { name: "verification_obligation_events" },
      { name: "verification_obligations" },
    ]);

    const obligationColumns = new Set(
      database.$client
        .prepare("PRAGMA table_info(verification_obligations)")
        .all()
        .map((row) => (row as { name: string }).name),
    );
    for (const column of [
      "repository_id",
      "run_id",
      "stage_id",
      "branch",
      "target_commit_sha",
      "gate_name",
      "command",
      "required_capabilities_json",
      "responsible_actor",
      "next_action",
      "toolchain_manifest",
      "status",
      "failure_classification",
      "failure_signature",
      "result_summary",
      "evidence_urls_json",
      "created_at",
      "last_attempt_at",
      "resolved_at",
      "version",
    ]) {
      expect(obligationColumns.has(column)).toBe(true);
    }

    expect(
      database.$client
        .prepare(
          `SELECT name FROM _semogtw_migrations
           WHERE name IN ('0011_scope_reservations.sql', '0012_verification_obligations.sql')
           ORDER BY name ASC`,
        )
        .all(),
    ).toEqual([
      { name: "0011_scope_reservations.sql" },
      { name: "0012_verification_obligations.sql" },
    ]);

    database.$client.close();
  });

  it("enforces version and exact SHA constraints", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO scope_reservations (
            id, project_id, repository_id, run_id, branch, kind,
            patterns_json, holder_label, purpose, state, acquired_at,
            renewed_at, expires_at, released_at, version
          ) VALUES (?, NULL, ?, NULL, ?, 'directory', '[]', ?, ?, 'active',
                    ?, ?, ?, NULL, 0)`,
        )
        .run(
          "invalid-version",
          "repository-1",
          "main",
          "agent",
          "Invalid version probe",
          "2026-08-03T08:00:00.000Z",
          "2026-08-03T08:00:00.000Z",
          "2026-08-03T09:00:00.000Z",
        ),
    ).toThrow();

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO verification_obligations (
            id, project_id, repository_id, run_id, stage_id, branch,
            target_commit_sha, gate_name, command,
            required_capabilities_json, responsible_actor, next_action,
            toolchain_manifest, status, failure_classification,
            failure_signature, result_summary, evidence_urls_json,
            created_at, last_attempt_at, resolved_at, version
          ) VALUES (?, NULL, ?, NULL, NULL, ?, ?, ?, ?, '[]', ?, ?, NULL,
                    'pending', NULL, NULL, NULL, '[]', ?, NULL, NULL, 1)`,
        )
        .run(
          "invalid-sha",
          "repository-1",
          "main",
          "abc123",
          "Typecheck",
          "pnpm typecheck",
          "agent",
          "Run typecheck.",
          "2026-08-03T08:00:00.000Z",
        ),
    ).toThrow();

    database.$client.close();
  });
});
