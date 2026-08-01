import { describe, expect, it } from "vitest";
import type {
  BranchRecommendationAcceptanceAuditEvent,
  RepositoryBranchCandidate,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteBranchRecommendationAcceptanceRepository } from "./branch-recommendation-acceptance-repository";

const observedAt = "2026-08-01T20:00:00.000Z";
const acceptedAt = "2026-08-01T20:30:00.000Z";

function seedRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, github_node_id, owner, name, full_name, html_url,
        visibility, default_branch, active_branch, role, sync_enabled, status,
        last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      "R_repo",
      "Semogtw",
      "SemogSite",
      "Semogtw/SemogSite",
      "https://github.com/Semogtw/SemogSite",
      "private",
      "main",
      "main",
      "primary",
      1,
      "active",
      observedAt,
      "github",
      observedAt,
      observedAt,
    );
}

function seedRecommendation(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    suffix: string;
    branch: string;
    observedAt: string;
  },
): void {
  database.$client
    .prepare(
      `INSERT INTO sync_runs (
        id, integration, scope, status, started_at, finished_at,
        created_count, updated_count, skipped_count, error_count,
        warnings_json, error_summary, cursor, rate_limit_remaining,
        rate_limit_reset_at, metadata_json
      ) VALUES (?, 'github', 'repositories', 'success', ?, ?, 1, 0, 0, 0, '[]', NULL, NULL, 4900, NULL, '{}')`,
    )
    .run(`sync-${input.suffix}`, input.observedAt, input.observedAt);
  database.$client
    .prepare(
      `INSERT INTO github_repository_observations (
        id, sync_run_id, repository_id, github_node_id, full_name,
        visibility, default_branch, html_url, archived, pushed_at,
        provider_updated_at, observed_at, api_version, etag,
        rate_limit_remaining, rate_limit_reset_at, branches_truncated,
        source_hash
      ) VALUES (?, ?, 'repository-1', 'R_repo', 'Semogtw/SemogSite',
        'private', 'main', 'https://github.com/Semogtw/SemogSite', 0, ?,
        ?, ?, '2026-03-10', NULL, 4900, NULL, 0, ?)`,
    )
    .run(
      `observation-${input.suffix}`,
      `sync-${input.suffix}`,
      input.observedAt,
      input.observedAt,
      input.observedAt,
      `observation-hash-${input.suffix}`,
    );
  database.$client
    .prepare(
      `INSERT INTO github_branch_recommendations (
        id, repository_observation_id, repository_id, status, branch,
        confidence, reason, warnings_json, evidence_json, observed_at,
        source_hash
      ) VALUES (?, ?, 'repository-1', 'recommended', ?, 'high', ?, '[]', '[]', ?, ?)`,
    )
    .run(
      `recommendation-${input.suffix}`,
      `observation-${input.suffix}`,
      input.branch,
      `Recomendação ${input.suffix}`,
      input.observedAt,
      `recommendation-hash-${input.suffix}`,
    );
}

function acceptedCandidate(
  before: RepositoryBranchCandidate,
): RepositoryBranchCandidate {
  return {
    ...before,
    repository: {
      ...before.repository,
      activeBranch: before.recommendation!.branch,
      updatedAt: acceptedAt,
    },
  };
}

function auditFor(
  before: RepositoryBranchCandidate,
  after: RepositoryBranchCandidate,
  id = "audit-branch-accept",
): BranchRecommendationAcceptanceAuditEvent {
  return {
    id,
    actor: "semogtw-owner",
    action: "repository.active_branch.accept",
    entityType: "repository",
    entityId: before.repository.id,
    before,
    after,
    reason: "Linha de desenvolvimento validada manualmente.",
    occurredAt: acceptedAt,
    source: "manual",
    confirmed: true,
    correlationId: "correlation-branch-accept",
  };
}

describe("SqliteBranchRecommendationAcceptanceRepository", () => {
  it("hydrates the repository and latest recommendation", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    seedRecommendation(database, {
      suffix: "old",
      branch: "release",
      observedAt: "2026-08-01T19:00:00.000Z",
    });
    seedRecommendation(database, {
      suffix: "latest",
      branch: "develop/foundation-bootstrap",
      observedAt,
    });
    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );

    await expect(repository.findCandidate("repository-1")).resolves.toEqual({
      repository: {
        id: "repository-1",
        fullName: "Semogtw/SemogSite",
        activeBranch: "main",
        defaultBranch: "main",
        updatedAt: observedAt,
      },
      recommendation: {
        id: "recommendation-latest",
        status: "recommended",
        branch: "develop/foundation-bootstrap",
        confidence: "high",
        observedAt,
      },
    });
  });

  it("updates only active branch metadata and inserts audit atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    seedRecommendation(database, {
      suffix: "latest",
      branch: "develop/foundation-bootstrap",
      observedAt,
    });
    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );
    const before = (await repository.findCandidate("repository-1"))!;
    const after = acceptedCandidate(before);
    const audit = auditFor(before, after);

    await expect(
      repository.acceptWithAudit(before, after, audit),
    ).resolves.toBe(true);

    expect(
      database.$client
        .prepare(
          "SELECT active_branch, default_branch, github_node_id, data_source, updated_at FROM repositories WHERE id = ?",
        )
        .get("repository-1"),
    ).toEqual({
      active_branch: "develop/foundation-bootstrap",
      default_branch: "main",
      github_node_id: "R_repo",
      data_source: "github",
      updated_at: acceptedAt,
    });
    expect(
      database.$client
        .prepare("SELECT action, before_json, after_json FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toEqual({
      action: "repository.active_branch.accept",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    });
  });

  it("rejects a stale recommendation and writes no audit", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    seedRecommendation(database, {
      suffix: "first",
      branch: "develop",
      observedAt: "2026-08-01T19:30:00.000Z",
    });
    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );
    const before = (await repository.findCandidate("repository-1"))!;
    seedRecommendation(database, {
      suffix: "newer",
      branch: "release",
      observedAt,
    });
    const after = acceptedCandidate(before);
    const audit = auditFor(before, after, "audit-stale-recommendation");

    await expect(
      repository.acceptWithAudit(before, after, audit),
    ).resolves.toBe(false);
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toBeUndefined();
  });

  it("rejects stale repository state and rolls back on audit failure", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    seedRecommendation(database, {
      suffix: "latest",
      branch: "develop/foundation-bootstrap",
      observedAt,
    });
    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );
    const before = (await repository.findCandidate("repository-1"))!;
    const after = acceptedCandidate(before);

    database.$client
      .prepare("UPDATE repositories SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T20:10:00.000Z", "repository-1");
    await expect(
      repository.acceptWithAudit(
        before,
        after,
        auditFor(before, after, "audit-stale-repository"),
      ),
    ).resolves.toBe(false);

    database.$client
      .prepare("UPDATE repositories SET updated_at = ? WHERE id = ?")
      .run(before.repository.updatedAt, "repository-1");
    const duplicateAudit = auditFor(before, after, "audit-duplicate");
    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        duplicateAudit.id,
        duplicateAudit.actor,
        duplicateAudit.action,
        duplicateAudit.entityType,
        duplicateAudit.entityId,
        JSON.stringify(duplicateAudit.before),
        JSON.stringify(duplicateAudit.after),
        duplicateAudit.reason,
        duplicateAudit.occurredAt,
        duplicateAudit.source,
        1,
        duplicateAudit.correlationId,
      );

    await expect(
      repository.acceptWithAudit(before, after, duplicateAudit),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT active_branch, updated_at FROM repositories WHERE id = ?")
        .get("repository-1"),
    ).toEqual({
      active_branch: "main",
      updated_at: before.repository.updatedAt,
    });
  });
});
