import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGitHubSyncStore } from "./github-sync-store";

const now = "2026-08-01T23:00:00.000Z";

describe("SqliteGitHubSyncStore empty runs", () => {
  it("records a specific failure summary when no target was enabled", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const store = new SqliteGitHubSyncStore(database);

    await store.startRun({
      id: "sync-run-empty",
      integration: "github",
      scope: "repositories",
      status: "running",
      startedAt: now,
    });
    await store.finishRun({
      id: "sync-run-empty",
      status: "failed",
      finishedAt: now,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      warnings: ["NO_SYNC_TARGETS"],
      rateLimitRemaining: null,
      rateLimitResetAt: null,
      processedTargets: 0,
    });

    expect(
      database.$client
        .prepare(
          "SELECT status, repositories_checked, error_count, error_summary, warnings_json FROM sync_runs WHERE id = ?",
        )
        .get("sync-run-empty"),
    ).toEqual({
      status: "failed",
      repositories_checked: 0,
      error_count: 1,
      error_summary: "Nenhum alvo de sincronização estava habilitado.",
      warnings_json: JSON.stringify(["NO_SYNC_TARGETS"]),
    });
    database.$client.close();
  });
});
