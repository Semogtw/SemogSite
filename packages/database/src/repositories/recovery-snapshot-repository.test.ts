import { describe, expect, it } from "vitest";
import {
  RecoverySnapshotService,
  type RecoverySnapshotInput,
} from "@semogtw/domain/orchestration";
import { createHash } from "node:crypto";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRecoverySnapshotRepository } from "./recovery-snapshot-repository";

const generatedAt = "2026-08-03T12:30:00.000Z";

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?, ?)`,
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
      "develop/workflow-control-core",
      "https://github.com/Semogtw/SemogSite",
      "manual",
      generatedAt,
      generatedAt,
    );
}

function input(
  overrides: Partial<RecoverySnapshotInput> = {},
): RecoverySnapshotInput {
  return {
    snapshotId: "snapshot-1",
    generatedAt,
    sourceObservedAt: "2026-08-03T12:25:00.000Z",
    confidence: "high",
    project: {
      id: "demo-project-platform",
      slug: "semogsite",
      name: "SemogSite",
    },
    repository: {
      id: "repository-1",
      fullName: "Semogtw/SemogSite",
      branch: "develop/workflow-control-core",
      observedCommitSha: "a".repeat(40),
    },
    run: null,
    stage: null,
    plan: {
      path: "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
      section: "Task 6",
    },
    commits: [],
    pushState: "confirmed",
    tests: [],
    obligations: [],
    reservations: [],
    blockers: [],
    decisions: ["Remote MCP is optional."],
    nextAction: "Continue owner-only composition.",
    requiredDocuments: [],
    runtime: {
      label: "GitHub connector",
      capabilities: ["github-read", "github-write"],
      toolchainManifest: null,
    },
    continuation: {
      templateId: "workflow-resume",
      templateVersion: 1,
      prompt: "Continue from the exact branch and SHA in this snapshot.",
    },
    warnings: [],
    ...overrides,
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const context = {
  actorId: "owner-1",
  auditId: "audit-snapshot-1",
  idempotencyKey: "snapshot-attempt-1",
  correlationId: "snapshot-correlation-1",
  source: "manual" as const,
};

describe("SqliteRecoverySnapshotRepository", () => {
  it("stores one immutable canonical snapshot and global audit atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteRecoverySnapshotRepository(database);
    const service = new RecoverySnapshotService(repository, hash);

    const result = await service.create(input(), context);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("snapshot should be stored");

    expect(
      database.$client
        .prepare(
          `SELECT project_id, repository_id, run_id, branch,
                  observed_commit_sha, schema_version, generated_at,
                  source_observed_at, confidence, canonical_hash,
                  template_id, template_version, created_by, source,
                  idempotency_key, correlation_id
           FROM recovery_snapshots WHERE id = ?`,
        )
        .get(result.record.id),
    ).toEqual({
      project_id: "demo-project-platform",
      repository_id: "repository-1",
      run_id: null,
      branch: "develop/workflow-control-core",
      observed_commit_sha: "a".repeat(40),
      schema_version: 1,
      generated_at: generatedAt,
      source_observed_at: "2026-08-03T12:25:00.000Z",
      confidence: "high",
      canonical_hash: result.record.canonicalHash,
      template_id: "workflow-resume",
      template_version: 1,
      created_by: "owner-1",
      source: "manual",
      idempotency_key: "snapshot-attempt-1",
      correlation_id: "snapshot-correlation-1",
    });
    expect(
      database.$client
        .prepare(
          "SELECT canonical_json, markdown FROM recovery_snapshots WHERE id = ?",
        )
        .get(result.record.id),
    ).toEqual({
      canonical_json: result.record.canonicalJson,
      markdown: result.record.markdown,
    });
    expect(
      database.$client
        .prepare(
          "SELECT action, entity_type, entity_id FROM audit_events WHERE id = ?",
        )
        .get(context.auditId),
    ).toEqual({
      action: "recovery_snapshot.create",
      entity_type: "recovery_snapshot",
      entity_id: "snapshot-1",
    });
    database.$client.close();
  });

  it("maps a stable retry to duplicate and changed reuse to conflict", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteRecoverySnapshotRepository(database);
    const service = new RecoverySnapshotService(repository, hash);

    await expect(service.create(input(), context)).resolves.toMatchObject({
      ok: true,
    });
    await expect(service.create(input(), context)).resolves.toEqual({
      ok: false,
      code: "DUPLICATE",
    });
    await expect(
      service.create(
        input({ nextAction: "A different next action." }),
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM recovery_snapshots")
        .get(),
    ).toEqual({ count: 1 });
    database.$client.close();
  });

  it("deduplicates the same canonical hash even under another ID", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    const repository = new SqliteRecoverySnapshotRepository(database);
    const service = new RecoverySnapshotService(repository, () => "b".repeat(64));

    await expect(service.create(input(), context)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      service.create(
        input({ snapshotId: "snapshot-2" }),
        {
          ...context,
          auditId: "audit-snapshot-2",
          idempotencyKey: "snapshot-attempt-2",
        },
      ),
    ).resolves.toEqual({ ok: false, code: "DUPLICATE" });
    database.$client.close();
  });

  it("rejects missing repository and run references without partial inserts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteRecoverySnapshotRepository(database);
    const service = new RecoverySnapshotService(repository, hash);

    await expect(service.create(input(), context)).resolves.toEqual({
      ok: false,
      code: "REPOSITORY_NOT_FOUND",
    });

    insertRepository(database);
    await expect(
      service.create(
        input({
          snapshotId: "snapshot-run",
          run: {
            id: "run-missing",
            phase: "Validation",
            summary: "Resume later.",
          },
        }),
        {
          ...context,
          auditId: "audit-snapshot-run",
          idempotencyKey: "snapshot-run-attempt",
        },
      ),
    ).resolves.toEqual({ ok: false, code: "RUN_NOT_FOUND" });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM recovery_snapshots")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });
});
