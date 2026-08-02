import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetLifecycleRepository } from "./repository-target-lifecycle-repository";

const now = "2026-08-01T23:30:00.000Z";

function seedHistorical(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, github_node_id, owner, name, full_name, github_url,
        visibility, default_branch, active_branch, role, sync_enabled, status,
        last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "repository-historical",
      "demo-project-platform",
      "R_historical",
      "Semogtw",
      "Historical",
      "Semogtw/Historical",
      "https://github.com/Semogtw/Historical",
      "private",
      "main",
      "main",
      "experiment",
      0,
      "historical",
      now,
      "github",
      now,
      now,
    );
}

describe("SqliteRepositoryTargetLifecycleRepository status boundary", () => {
  it("does not expose historical repositories as mutable sync targets", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedHistorical(database);
    const repository = new SqliteRepositoryTargetLifecycleRepository(database);

    await expect(repository.findTarget("repository-historical")).resolves.toBeNull();
    expect(
      database.$client
        .prepare("SELECT sync_enabled, status FROM repositories WHERE id = ?")
        .get("repository-historical"),
    ).toEqual({ sync_enabled: 0, status: "historical" });
    database.$client.close();
  });
});
