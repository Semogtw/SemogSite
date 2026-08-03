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

  it("enforces event idempotency and reservation version constraints", () => {
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

    database.$client.close();
  });
});
