import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteSafeWorkSource } from "./safe-work-source";

const observedAt = "2026-08-03T15:00:00.000Z";
const branch = "develop/workflow-control-core";

function insertProject(
  database: ReturnType<typeof createSqliteDatabase>,
  id: string,
  overrides: {
    priority?: "critical" | "high" | "medium" | "low";
    health?: "healthy" | "attention" | "blocked" | "unknown";
    confidence?: "high" | "medium" | "low";
    manualLock?: boolean;
    status?: "planning" | "active" | "paused" | "archived";
  } = {},
): void {
  database.$client
    .prepare(
      `INSERT INTO projects (
        id, slug, name, icon, status, health, priority, progress_estimate,
        focus, next_action, branch_summary, status_basis, confidence,
        visibility, public_summary, private_summary, public_progress,
        featured, cover_asset_id, live_url, documentation_url,
        last_activity_at, last_synced_at, manual_lock, data_source,
        created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, 0, ?, ?, NULL, ?, ?, 'private',
                NULL, NULL, NULL, 0, NULL, NULL, NULL, ?, ?, ?, 'manual', ?, ?)`,
    )
    .run(
      id,
      `${id}-slug`,
      `Project ${id}`,
      overrides.status ?? "active",
      overrides.health ?? "healthy",
      overrides.priority ?? "high",
      "Current focus.",
      "Continue the first unfinished stage.",
      "Persisted manual roadmap state.",
      overrides.confidence ?? "high",
      "2026-08-03T14:50:00.000Z",
      "2026-08-03T14:50:00.000Z",
      overrides.manualLock ? 1 : 0,
      "2026-08-03T14:00:00.000Z",
      "2026-08-03T14:50:00.000Z",
    );
}

function insertRepository(
  database: ReturnType<typeof createSqliteDatabase>,
  id: string,
  projectId: string,
  fullName: string,
): void {
  const name = fullName.split("/").at(-1) ?? id;
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, 'Semogtw', ?, ?, 'product', 'private', 'active',
                'main', ?, ?, NULL, 1, ?, 'manual', ?, ?)`,
    )
    .run(
      id,
      projectId,
      name,
      fullName,
      branch,
      `https://github.com/${fullName}`,
      "2026-08-03T14:55:00.000Z",
      "2026-08-03T14:00:00.000Z",
      "2026-08-03T14:55:00.000Z",
    );
}

function insertStage(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    projectId: string;
    orderIndex: number;
    title: string;
    state?: "backlog" | "next" | "in_progress" | "blocked" | "completed";
    manualLock?: boolean;
  },
): void {
  const state = input.state ?? "next";
  database.$client
    .prepare(
      `INSERT INTO stages (
        id, project_id, workstream_id, order_index, title, area, state,
        progress, planned_result, current_position, next_step, blocker,
        evidence_summary, done, manual_lock, updated_from, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'implementation', ?, ?, ?, ?, ?, NULL,
                NULL, ?, ?, 'manual', ?, ?)`,
    )
    .run(
      input.id,
      input.projectId,
      input.orderIndex,
      input.title,
      state,
      state === "completed" ? 100 : 20,
      `Deliver ${input.title}.`,
      `Current position for ${input.title}.`,
      state === "completed" ? null : `Continue ${input.title}.`,
      state === "completed" ? 1 : 0,
      input.manualLock ? 1 : 0,
      "2026-08-03T14:00:00.000Z",
      "2026-08-03T14:55:00.000Z",
    );
}

describe("SqliteSafeWorkSource", () => {
  it("recommends only the first unfinished stage for a project with one active repository", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertProject(database, "safe-project", { priority: "critical" });
    insertRepository(
      database,
      "safe-repository",
      "safe-project",
      "Semogtw/SafeProject",
    );
    insertStage(database, {
      id: "stage-completed",
      projectId: "safe-project",
      orderIndex: 1,
      title: "Foundation",
      state: "completed",
    });
    insertStage(database, {
      id: "stage-current",
      projectId: "safe-project",
      orderIndex: 2,
      title: "Workflow composition",
      state: "next",
    });
    insertStage(database, {
      id: "stage-later",
      projectId: "safe-project",
      orderIndex: 3,
      title: "Release automation",
      state: "backlog",
    });

    const source = new SqliteSafeWorkSource(database);
    const result = await source.evaluate({
      observedAt,
      availableCapabilities: ["node-22", "pnpm-10"],
      defaultEstimatedMinutes: 60,
    });

    expect(result.recommendations).toEqual([
      expect.objectContaining({
        candidateId: "stage-current",
        title: "Workflow composition",
        reasons: expect.arrayContaining([
          "PRIORITY_CRITICAL",
          "READY_NEXT",
          "NO_SCOPE_CONFLICT",
        ]),
      }),
    ]);
    expect(result.exclusions).toEqual([]);
    expect(result.sourceExclusions).toEqual([
      {
        stageId: "stage-later",
        projectId: "safe-project",
        code: "PREVIOUS_STAGE_INCOMPLETE",
        details: ["stage-current"],
      },
    ]);
    database.$client.close();
  });

  it("refuses to choose between multiple active repositories", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertProject(database, "ambiguous-project");
    insertRepository(
      database,
      "ambiguous-repository-a",
      "ambiguous-project",
      "Semogtw/AmbiguousA",
    );
    insertRepository(
      database,
      "ambiguous-repository-b",
      "ambiguous-project",
      "Semogtw/AmbiguousB",
    );
    insertStage(database, {
      id: "ambiguous-stage",
      projectId: "ambiguous-project",
      orderIndex: 1,
      title: "Choose repository scope",
    });

    const source = new SqliteSafeWorkSource(database);
    const result = await source.evaluate({
      observedAt,
      availableCapabilities: [],
      defaultEstimatedMinutes: 45,
    });

    expect(result.recommendations).toEqual([]);
    expect(result.sourceExclusions).toEqual([
      {
        stageId: "ambiguous-stage",
        projectId: "ambiguous-project",
        code: "REPOSITORY_AMBIGUOUS",
        details: ["ambiguous-repository-a", "ambiguous-repository-b"],
      },
    ]);
    database.$client.close();
  });

  it("preserves owner locks as evaluator exclusions", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertProject(database, "locked-project", { manualLock: true });
    insertRepository(
      database,
      "locked-repository",
      "locked-project",
      "Semogtw/LockedProject",
    );
    insertStage(database, {
      id: "locked-stage",
      projectId: "locked-project",
      orderIndex: 1,
      title: "Owner decision",
    });

    const result = await new SqliteSafeWorkSource(database).evaluate({
      observedAt,
      availableCapabilities: [],
      defaultEstimatedMinutes: 30,
    });

    expect(result.recommendations).toEqual([]);
    expect(result.exclusions).toEqual([
      {
        candidateId: "locked-stage",
        codes: ["OWNER_DECISION_REQUIRED"],
        details: [],
      },
    ]);
    database.$client.close();
  });

  it("excludes overlapping reservations and unresolved stage gates", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertProject(database, "guarded-project");
    insertRepository(
      database,
      "guarded-repository",
      "guarded-project",
      "Semogtw/GuardedProject",
    );
    insertStage(database, {
      id: "guarded-stage",
      projectId: "guarded-project",
      orderIndex: 1,
      title: "Guarded implementation",
      state: "in_progress",
    });
    database.$client
      .prepare(
        `INSERT INTO scope_reservations (
          id, project_id, repository_id, run_id, branch, kind,
          patterns_json, holder_label, purpose, state, acquired_at,
          renewed_at, expires_at, released_at, version
        ) VALUES ('reservation-guarded', 'guarded-project',
                  'guarded-repository', NULL, ?, 'repository', '["**"]',
                  'agent-b', 'Concurrent work', 'active', ?, ?, ?, NULL, 1)`,
      )
      .run(
        branch,
        "2026-08-03T14:00:00.000Z",
        "2026-08-03T14:30:00.000Z",
        "2026-08-03T16:00:00.000Z",
      );
    database.$client
      .prepare(
        `INSERT INTO verification_obligations (
          id, project_id, repository_id, run_id, stage_id, branch,
          target_commit_sha, gate_name, command, required_capabilities_json,
          responsible_actor, next_action, toolchain_manifest, status,
          failure_classification, failure_signature, result_summary,
          evidence_urls_json, created_at, last_attempt_at, resolved_at, version
        ) VALUES ('gate-guarded', 'guarded-project', 'guarded-repository',
                  NULL, 'guarded-stage', ?, ?, 'Android generation',
                  'pnpm generate:android', '["android-sdk"]', 'agent-a',
                  'Run in an Android-capable environment.', NULL, 'pending',
                  NULL, NULL, NULL, '[]', ?, NULL, NULL, 1)`,
      )
      .run(branch, "a".repeat(40), "2026-08-03T14:40:00.000Z");

    const result = await new SqliteSafeWorkSource(database).evaluate({
      observedAt,
      availableCapabilities: ["node-22"],
      defaultEstimatedMinutes: 90,
    });

    expect(result.recommendations).toEqual([]);
    expect(result.exclusions).toEqual([
      {
        candidateId: "guarded-stage",
        codes: [
          "CAPABILITY_MISSING",
          "SCOPE_RESERVED",
          "PREREQUISITE_GATE_UNRESOLVED",
        ],
        details: ["android-sdk", "gate-guarded", "reservation-guarded"],
      },
    ]);
    database.$client.close();
  });

  it("rejects an invalid default estimate before evaluating persisted data", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqliteSafeWorkSource(database);

    await expect(
      source.evaluate({
        observedAt,
        availableCapabilities: [],
        defaultEstimatedMinutes: 0,
      }),
    ).resolves.toEqual({
      observedAt,
      recommendations: [],
      exclusions: [],
      sourceExclusions: [],
      errors: ["DEFAULT_ESTIMATE_INVALID"],
    });
    database.$client.close();
  });
});
