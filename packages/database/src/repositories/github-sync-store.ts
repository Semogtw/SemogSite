import type {
  GitHubSyncRunFinish,
  GitHubSyncRunStart,
  GitHubSyncStore,
  ObservationInsertResult,
  RepositoryObservationAggregate,
  RepositorySyncTarget,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function parseFullName(fullName: string): { owner: string; name: string } {
  const normalized = fullName.trim();
  const separator = normalized.indexOf("/");
  if (
    separator <= 0 ||
    separator === normalized.length - 1 ||
    normalized.indexOf("/", separator + 1) !== -1
  ) {
    throw new Error("INVALID_GITHUB_FULL_NAME");
  }
  return {
    owner: normalized.slice(0, separator),
    name: normalized.slice(separator + 1),
  };
}

export class SqliteGitHubSyncStore implements GitHubSyncStore {
  constructor(private readonly database: SqliteDatabase) {}

  async listTargets(limit: number): Promise<readonly RepositorySyncTarget[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT id, owner, name, full_name, default_branch, active_branch
         FROM repositories
         WHERE sync_enabled = 1 AND status = 'active'
         ORDER BY
           CASE role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,
           full_name ASC
         LIMIT ?`,
      )
      .all(normalizeLimit(limit)) as Array<{
      id: string;
      owner: string;
      name: string;
      full_name: string;
      default_branch: string;
      active_branch: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      name: row.name,
      fullName: row.full_name,
      defaultBranch: row.default_branch,
      currentActiveBranch: row.active_branch,
    }));
  }

  async startRun(run: GitHubSyncRunStart): Promise<void> {
    this.database.$client
      .prepare(
        `INSERT INTO sync_runs (
          id, integration, scope, status, started_at, finished_at,
          created_count, updated_count, skipped_count, error_count,
          warnings_json, error_summary, cursor, rate_limit_remaining,
          rate_limit_reset_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, '[]', NULL, NULL, NULL, NULL, '{}')`,
      )
      .run(
        run.id,
        run.integration,
        run.scope,
        run.status,
        run.startedAt,
      );
  }

  async recordObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<ObservationInsertResult> {
    const transaction = this.database.$client.transaction(() => {
      const existing = this.database.$client
        .prepare(
          "SELECT id FROM github_repository_observations WHERE source_hash = ?",
        )
        .get(observation.repository.sourceHash) as { id: string } | undefined;

      let result: ObservationInsertResult = "duplicate";
      if (existing === undefined) {
        this.insertAggregate(observation);
        result = "inserted";
      }

      const identity = parseFullName(observation.repository.fullName);
      const metadataUpdate = this.database.$client
        .prepare(
          `UPDATE repositories
           SET github_node_id = ?,
               owner = ?,
               name = ?,
               full_name = ?,
               html_url = ?,
               visibility = ?,
               default_branch = ?,
               status = CASE WHEN ? = 1 THEN 'archived' ELSE status END,
               last_synced_at = ?,
               data_source = 'github',
               updated_at = ?
           WHERE id = ?`,
        )
        .run(
          observation.repository.githubNodeId,
          identity.owner,
          identity.name,
          observation.repository.fullName,
          observation.repository.htmlUrl,
          observation.repository.visibility,
          observation.repository.defaultBranch,
          observation.repository.archived ? 1 : 0,
          observation.repository.observedAt,
          observation.repository.observedAt,
          observation.repository.repositoryId,
        );
      if (metadataUpdate.changes !== 1) {
        throw new Error("GITHUB_SYNC_TARGET_NOT_FOUND");
      }

      return result;
    });

    return transaction();
  }

  async finishRun(run: GitHubSyncRunFinish): Promise<void> {
    const update = this.database.$client
      .prepare(
        `UPDATE sync_runs
         SET status = ?,
             finished_at = ?,
             created_count = ?,
             updated_count = ?,
             skipped_count = ?,
             error_count = ?,
             warnings_json = ?,
             error_summary = ?,
             rate_limit_remaining = ?,
             rate_limit_reset_at = ?,
             metadata_json = ?
         WHERE id = ? AND status = 'running'`,
      )
      .run(
        run.status,
        run.finishedAt,
        run.createdCount,
        run.updatedCount,
        run.skippedCount,
        run.errorCount,
        JSON.stringify(run.warnings),
        run.errorCount > 0
          ? `${run.errorCount} alvo(s) com falha ou observação parcial.`
          : null,
        run.rateLimitRemaining,
        run.rateLimitResetAt,
        JSON.stringify({ processedTargets: run.processedTargets }),
        run.id,
      );
    if (update.changes !== 1) throw new Error("SYNC_RUN_NOT_RUNNING");
  }

  private insertAggregate(observation: RepositoryObservationAggregate): void {
    this.database.$client
      .prepare(
        `INSERT INTO github_repository_observations (
          id, sync_run_id, repository_id, github_node_id, full_name,
          visibility, default_branch, html_url, archived, pushed_at,
          provider_updated_at, observed_at, api_version, etag,
          rate_limit_remaining, rate_limit_reset_at, branches_truncated,
          source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        observation.repository.id,
        observation.repository.syncRunId,
        observation.repository.repositoryId,
        observation.repository.githubNodeId,
        observation.repository.fullName,
        observation.repository.visibility,
        observation.repository.defaultBranch,
        observation.repository.htmlUrl,
        observation.repository.archived ? 1 : 0,
        observation.repository.pushedAt,
        observation.repository.providerUpdatedAt,
        observation.repository.observedAt,
        observation.repository.apiVersion,
        observation.repository.etag,
        observation.repository.rateLimitRemaining,
        observation.repository.rateLimitResetAt,
        observation.repository.branchesTruncated ? 1 : 0,
        observation.repository.sourceHash,
      );

    const branchInsert = this.database.$client.prepare(
      `INSERT INTO github_branch_observations (
        id, repository_observation_id, repository_id, name, head_sha,
        committed_at, protected, is_default, observed_at, source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const branch of observation.branches) {
      branchInsert.run(
        branch.id,
        branch.repositoryObservationId,
        branch.repositoryId,
        branch.name,
        branch.headSha,
        branch.committedAt,
        branch.protected ? 1 : 0,
        branch.isDefault ? 1 : 0,
        branch.observedAt,
        branch.sourceHash,
      );
    }

    this.database.$client
      .prepare(
        `INSERT INTO github_branch_recommendations (
          id, repository_observation_id, repository_id, status, branch,
          confidence, reason, warnings_json, evidence_json, observed_at,
          source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        observation.recommendation.id,
        observation.recommendation.repositoryObservationId,
        observation.recommendation.repositoryId,
        observation.recommendation.status,
        observation.recommendation.branch,
        observation.recommendation.confidence,
        observation.recommendation.reason,
        JSON.stringify(observation.recommendation.warnings),
        JSON.stringify(observation.recommendation.evidence),
        observation.recommendation.observedAt,
        observation.recommendation.sourceHash,
      );
  }
}
