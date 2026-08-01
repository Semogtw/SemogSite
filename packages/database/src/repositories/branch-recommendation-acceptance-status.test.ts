import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteBranchRecommendationAcceptanceRepository } from "./branch-recommendation-acceptance-repository";

const now = "2026-08-02T00:00:00.000Z";

describe("SqliteBranchRecommendationAcceptanceRepository status boundary", () => {
  it("does not expose historical repositories for branch decisions", async () => {
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
    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );

    await expect(
      repository.findCandidate("repository-historical"),
    ).resolves.toBeNull();
    database.$client.close();
  });
});
