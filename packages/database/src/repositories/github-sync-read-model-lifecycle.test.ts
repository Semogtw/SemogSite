import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGitHubSyncReadModel } from "./github-sync-read-model";

const now = "2026-08-01T22:00:00.000Z";

describe("SqliteGitHubSyncReadModel target lifecycle", () => {
  it("shows paused active repositories while excluding them from enabled count", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO repositories (
          id, project_id, github_node_id, owner, name, full_name, github_url,
          visibility, default_branch, active_branch, role, sync_enabled, status,
          last_synced_at, data_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "repository-paused",
        "demo-project-platform",
        "R_paused",
        "Semogtw",
        "Paused",
        "Semogtw/Paused",
        "https://github.com/Semogtw/Paused",
        "private",
        "main",
        "main",
        "integration",
        0,
        "active",
        now,
        "github",
        now,
        now,
      );
    const model = new SqliteGitHubSyncReadModel(database);

    await expect(model.getDashboard()).resolves.toMatchObject({
      configuredTargets: 0,
      repositories: [
        {
          id: "repository-paused",
          fullName: "Semogtw/Paused",
          syncEnabled: false,
          updatedAt: now,
        },
      ],
    });
    database.$client.close();
  });
});
