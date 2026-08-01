import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./sqlite";

describe("SQLite migrations", () => {
  it("applies every committed migration including the cooperative run ledger", () => {
    const database = createSqliteDatabase(":memory:");

    migrate(database);
    migrate(database);

    expect(
      database.$client
        .prepare("SELECT name FROM _semogtw_migrations ORDER BY name ASC")
        .all(),
    ).toEqual([
      { name: "0001_foundation.sql" },
      { name: "0002_seed_demo.sql" },
      { name: "0003_github_observations.sql" },
      { name: "0004_github_sync_runs.sql" },
      { name: "0005_cooperative_run_ledger.sql" },
    ]);
    expect(
      database.$client
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'github_repository_observations',
             'github_branch_observations',
             'github_branch_recommendations'
           )
           ORDER BY name ASC`,
        )
        .all(),
    ).toEqual([
      { name: "github_branch_observations" },
      { name: "github_branch_recommendations" },
      { name: "github_repository_observations" },
    ]);
    expect(
      database.$client
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name IN (
             'cooperative_runs',
             'cooperative_run_events',
             'cooperative_run_checkpoints',
             'cooperative_run_commands'
           )
           ORDER BY name ASC`,
        )
        .all(),
    ).toEqual([
      { name: "cooperative_run_checkpoints" },
      { name: "cooperative_run_commands" },
      { name: "cooperative_run_events" },
      { name: "cooperative_runs" },
    ]);

    const syncRunColumns = new Set(
      database.$client
        .prepare("PRAGMA table_info(sync_runs)")
        .all()
        .map((row) => (row as { name: string }).name),
    );
    for (const column of [
      "integration",
      "created_count",
      "updated_count",
      "skipped_count",
      "error_count",
      "rate_limit_remaining",
      "rate_limit_reset_at",
      "metadata_json",
    ]) {
      expect(syncRunColumns.has(column)).toBe(true);
    }

    database.$client.close();
  });
});
