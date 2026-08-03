import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRecoverySnapshotSource } from "./recovery-snapshot-source";

const generatedAt = "2026-08-03T13:00:00.000Z";
const branch = "develop/workflow-control-core";
const headSha = "a".repeat(40);

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?)`,
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
      branch,
      "https://github.com/Semogtw/SemogSite",
      "2026-08-03T12:55:00.000Z",
      "github",
      generatedAt,
      generatedAt,
    );
}

function insertObservation(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO github_repository_observations (
        id, repository_id, provider_node_id, full_name, html_url, visibility,
        default_branch, pushed_at, observed_at, api_version, etag,
        rate_limit_remaining, rate_limit_reset_at, source_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
    )
    .run(
      "observation-1",
      "repository-1",
      "node-1",
      "Semogtw/SemogSite",
      "https://github.com/Semogtw/SemogSite",
      "private",
      "main",
      "2026-08-03T12:50:00.000Z",
      "2026-08-03T12:55:00.000Z",
      "2022-11-28",
      4_999,
      "source-hash-1",
      "2026-08-03T12:55:00.000Z",
    );
  database.$client
    .prepare(
      `INSERT INTO github_branch_observations (
        id, repository_observation_id, name, head_sha, committed_at,
        protected, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
    )
    .run(
      "branch-observation-1",
      "observation-1",
      branch,
      headSha,
      "2026-08-03T12:50:00.000Z",
      "2026-08-03T12:55:00.000Z",
    );
}

describe("SqliteRecoverySnapshotSource", () => {
  it("builds a recovery input only from persisted repository observations and workflow state", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    insertObservation(database);

    database.$client
      .prepare(
        `INSERT INTO scope_reservations (
          id, project_id, repository_id, run_id, branch, kind,
          patterns_json, holder_label, purpose, state, acquired_at,
          renewed_at, expires_at, released_at, version
        ) VALUES (?, ?, ?, NULL, ?, 'directory', ?, ?, ?, 'active', ?, ?, ?, NULL, 1)`,
      )
      .run(
        "reservation-1",
        "demo-project-platform",
        "repository-1",
        branch,
        '["packages/domain/**"]',
        "agent-a",
        "Implement orchestration domain",
        "2026-08-03T12:00:00.000Z",
        "2026-08-03T12:30:00.000Z",
        "2026-08-03T14:00:00.000Z",
      );
    database.$client
      .prepare(
        `INSERT INTO verification_obligations (
          id, project_id, repository_id, run_id, stage_id, branch,
          target_commit_sha, gate_name, command, required_capabilities_json,
          responsible_actor, next_action, toolchain_manifest, status,
          failure_classification, failure_signature, result_summary,
          evidence_urls_json, created_at, last_attempt_at, resolved_at, version
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 'blocked',
                  'environment_missing', ?, ?, '[]', ?, ?, NULL, 2)`,
      )
      .run(
        "gate-1",
        "demo-project-platform",
        "repository-1",
        branch,
        headSha,
        "Database tests",
        "pnpm --filter @semogtw/database test",
        '["node-22","sqlite-native"]',
        "agent-a",
        "Run with native SQLite available.",
        "database tests|environment_missing|native sqlite missing",
        "Native SQLite missing.",
        "2026-08-03T12:10:00.000Z",
        "2026-08-03T12:20:00.000Z",
      );

    const source = new SqliteRecoverySnapshotSource(database);
    const result = await source.build({
      snapshotId: "snapshot-1",
      repositoryId: "repository-1",
      generatedAt,
      nextAction: "Continue after the database gate passes.",
      continuationPrompt: "Continue from the exact SHA in this snapshot.",
      runtimeLabel: "GitHub connector",
      runtimeCapabilities: ["github-read", "github-write"],
      toolchainManifest: null,
      planPath: "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
      planSection: "Task 6",
    });

    expect(result).toMatchObject({
      ok: true,
      input: {
        snapshotId: "snapshot-1",
        generatedAt,
        sourceObservedAt: "2026-08-03T12:55:00.000Z",
        confidence: "high",
        project: {
          id: "demo-project-platform",
          slug: "semogtw-platform",
          name: "Semogtw Platform",
        },
        repository: {
          id: "repository-1",
          fullName: "Semogtw/SemogSite",
          branch,
          observedCommitSha: headSha,
        },
        pushState: "confirmed",
        nextAction: "Continue after the database gate passes.",
        blockers: ["Database tests: Native SQLite missing."],
        warnings: [],
      },
    });
    if (!result.ok) throw new Error("source should be available");
    expect(result.input.reservations).toEqual([
      expect.objectContaining({
        id: "reservation-1",
        patterns: ["packages/domain/**"],
      }),
    ]);
    expect(result.input.obligations).toEqual([
      {
        id: "gate-1",
        gateName: "Database tests",
        status: "blocked",
        nextAction: "Run with native SQLite available.",
      },
    ]);
    expect(result.input.tests).toEqual([
      {
        gateName: "Database tests",
        status: "blocked",
        summary: "Native SQLite missing.",
      },
    ]);
    database.$client.close();
  });

  it("refuses to invent a commit when the accepted branch has no observation", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const source = new SqliteRecoverySnapshotSource(database);

    await expect(
      source.build({
        snapshotId: "snapshot-1",
        repositoryId: "repository-1",
        generatedAt,
        nextAction: "Continue.",
        continuationPrompt: "Continue.",
        runtimeLabel: "GitHub connector",
        runtimeCapabilities: ["github-read"],
        toolchainManifest: null,
        planPath: null,
        planSection: null,
      }),
    ).resolves.toEqual({ ok: false, code: "BRANCH_OBSERVATION_NOT_FOUND" });
    database.$client.close();
  });

  it("rejects missing project linkage and invalid generation time", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO repositories (
          id, project_id, owner, name, full_name, role, visibility, status,
          default_branch, active_branch, github_url, github_node_id,
          sync_enabled, last_synced_at, data_source, created_at, updated_at
        ) VALUES ('repository-orphan', NULL, 'Semogtw', 'Orphan', 'Semogtw/Orphan',
                  'experiment', 'private', 'active', 'main', NULL,
                  'https://github.com/Semogtw/Orphan', NULL, 1, NULL,
                  'manual', ?, ?)`,
      )
      .run(generatedAt, generatedAt);
    const source = new SqliteRecoverySnapshotSource(database);

    await expect(
      source.build({
        snapshotId: "snapshot-1",
        repositoryId: "repository-orphan",
        generatedAt,
        nextAction: "Continue.",
        continuationPrompt: "Continue.",
        runtimeLabel: "GitHub connector",
        runtimeCapabilities: ["github-read"],
        toolchainManifest: null,
        planPath: null,
        planSection: null,
      }),
    ).resolves.toEqual({ ok: false, code: "PROJECT_NOT_FOUND" });

    await expect(
      source.build({
        snapshotId: "snapshot-1",
        repositoryId: "repository-orphan",
        generatedAt: "invalid",
        nextAction: "Continue.",
        continuationPrompt: "Continue.",
        runtimeLabel: "GitHub connector",
        runtimeCapabilities: ["github-read"],
        toolchainManifest: null,
        planPath: null,
        planSection: null,
      }),
    ).resolves.toEqual({ ok: false, code: "GENERATED_AT_INVALID" });
    database.$client.close();
  });
});
