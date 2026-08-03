import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetOptions } from "./repository-target-options";

const now = "2026-08-02T00:15:00.000Z";

describe("SqliteRepositoryTargetOptions", () => {
  it("lists non-archived projects in deterministic display order", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO projects (
          id, slug, name, icon, status, health, priority, progress_estimate,
          focus, next_action, branch_summary, status_basis, confidence,
          visibility, public_summary, private_summary, public_progress,
          featured, cover_asset_id, live_url, documentation_url,
          last_activity_at, last_synced_at, manual_lock, data_source,
          created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'archived', 'unknown', 'low', 100,
          ?, ?, NULL, ?, 'low', 'private', NULL, NULL, NULL, 0, NULL, NULL,
          NULL, NULL, NULL, 1, 'manual', ?, ?)`,
      )
      .run(
        "project-archived",
        "archived-project",
        "Projeto arquivado",
        "Registro histórico.",
        "Nenhuma ação ativa.",
        "Arquivado manualmente.",
        now,
        now,
      );
    const options = new SqliteRepositoryTargetOptions(database);

    const projects = await options.listProjects();

    expect(projects.length).toBeGreaterThan(0);
    expect(projects).toContainEqual(
      expect.objectContaining({ id: "demo-project-platform" }),
    );
    expect(projects).not.toContainEqual(
      expect.objectContaining({ id: "project-archived" }),
    );
    expect(projects).toEqual(
      [...projects].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      ),
    );
    database.$client.close();
  });

  it("lists active workflow repository options with the effective branch", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO repositories (
          id, project_id, owner, name, full_name, role, visibility, status,
          default_branch, active_branch, github_url, github_node_id,
          sync_enabled, last_synced_at, data_source, created_at, updated_at
        ) VALUES
          ('repository-active', 'demo-project-platform', 'Semogtw', 'SemogSite',
           'Semogtw/SemogSite', 'product', 'private', 'active', 'main',
           'develop/workflow-control-core', 'https://github.com/Semogtw/SemogSite',
           NULL, 1, NULL, 'manual', ?, ?),
          ('repository-default', NULL, 'Semogtw', 'Offline-Toolchains',
           'Semogtw/Offline-Toolchains', 'infrastructure', 'public', 'active',
           'main', NULL, 'https://github.com/Semogtw/Offline-Toolchains',
           NULL, 1, NULL, 'manual', ?, ?),
          ('repository-paused', NULL, 'Semogtw', 'Old', 'Semogtw/Old',
           'experiment', 'private', 'paused', 'main', NULL,
           'https://github.com/Semogtw/Old', NULL, 0, NULL, 'manual', ?, ?)`,
      )
      .run(now, now, now, now, now, now);
    const options = new SqliteRepositoryTargetOptions(database);

    await expect(options.listWorkflowRepositories()).resolves.toEqual([
      {
        id: "repository-default",
        projectId: null,
        fullName: "Semogtw/Offline-Toolchains",
        branch: "main",
      },
      {
        id: "repository-active",
        projectId: "demo-project-platform",
        fullName: "Semogtw/SemogSite",
        branch: "develop/workflow-control-core",
      },
    ]);
    database.$client.close();
  });
});
