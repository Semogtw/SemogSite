import type { LatestRepositoryRecommendation } from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";
import { SqliteGitHubObservationRepository } from "./github-observation-repository";

export type GitHubSyncRunView = {
  id: string;
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  warnings: readonly string[];
  errorSummary: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  processedTargets: number | null;
  malformedJson: readonly ("warnings" | "metadata")[];
};

export type GitHubRepositorySyncView = {
  id: string;
  fullName: string;
  activeBranch: string | null;
  defaultBranch: string;
  lastSyncedAt: string | null;
  status: "active" | "paused" | "historical" | "experiment";
  syncEnabled: boolean;
  updatedAt: string;
  recommendation: LatestRepositoryRecommendation | null;
};

export type GitHubSyncDashboard = {
  configuredTargets: number;
  lastRun: GitHubSyncRunView | null;
  repositories: readonly GitHubRepositorySyncView[];
};

function parseWarnings(
  value: string,
  malformed: Array<"warnings" | "metadata">,
): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      malformed.push("warnings");
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    malformed.push("warnings");
    return [];
  }
}

function parseProcessedTargets(
  value: string,
  malformed: Array<"warnings" | "metadata">,
): number | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("processedTargets" in parsed)
    ) {
      malformed.push("metadata");
      return null;
    }
    const processedTargets = (parsed as { processedTargets?: unknown })
      .processedTargets;
    if (
      typeof processedTargets !== "number" ||
      !Number.isInteger(processedTargets) ||
      processedTargets < 0
    ) {
      malformed.push("metadata");
      return null;
    }
    return processedTargets;
  } catch {
    malformed.push("metadata");
    return null;
  }
}

export class SqliteGitHubSyncReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async getDashboard(): Promise<GitHubSyncDashboard> {
    const repositories = this.database.$client
      .prepare(
        `SELECT id, full_name, active_branch, default_branch, last_synced_at,
                status, sync_enabled, updated_at
         FROM repositories
         WHERE status = 'active'
         ORDER BY
           CASE role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,
           full_name ASC`,
      )
      .all() as Array<{
      id: string;
      full_name: string;
      active_branch: string | null;
      default_branch: string;
      last_synced_at: string | null;
      status: "active" | "paused" | "historical" | "experiment";
      sync_enabled: number;
      updated_at: string;
    }>;

    const observationRepository = new SqliteGitHubObservationRepository(
      this.database,
    );
    const repositoryViews: GitHubRepositorySyncView[] = [];
    for (const repository of repositories) {
      repositoryViews.push({
        id: repository.id,
        fullName: repository.full_name,
        activeBranch: repository.active_branch,
        defaultBranch: repository.default_branch,
        lastSyncedAt: repository.last_synced_at,
        status: repository.status,
        syncEnabled: repository.sync_enabled === 1,
        updatedAt: repository.updated_at,
        recommendation: await observationRepository.latestRecommendation(
          repository.id,
        ),
      });
    }

    const run = this.database.$client
      .prepare(
        `SELECT id, status, started_at, finished_at, created_count,
                updated_count, skipped_count, error_count, warnings_json,
                error_summary, rate_limit_remaining, rate_limit_reset_at,
                metadata_json
         FROM sync_runs
         WHERE integration = 'github'
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
      )
      .get() as
      | {
          id: string;
          status: "running" | "success" | "partial" | "failed";
          started_at: string;
          finished_at: string | null;
          created_count: number;
          updated_count: number;
          skipped_count: number;
          error_count: number;
          warnings_json: string;
          error_summary: string | null;
          rate_limit_remaining: number | null;
          rate_limit_reset_at: string | null;
          metadata_json: string;
        }
      | undefined;

    let lastRun: GitHubSyncRunView | null = null;
    if (run !== undefined) {
      const malformedJson: Array<"warnings" | "metadata"> = [];
      lastRun = {
        id: run.id,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        createdCount: run.created_count,
        updatedCount: run.updated_count,
        skippedCount: run.skipped_count,
        errorCount: run.error_count,
        warnings: parseWarnings(run.warnings_json, malformedJson),
        errorSummary: run.error_summary,
        rateLimitRemaining: run.rate_limit_remaining,
        rateLimitResetAt: run.rate_limit_reset_at,
        processedTargets: parseProcessedTargets(
          run.metadata_json,
          malformedJson,
        ),
        malformedJson,
      };
    }

    return {
      configuredTargets: repositories.filter(
        (repository) => repository.sync_enabled === 1,
      ).length,
      lastRun,
      repositories: repositoryViews,
    };
  }
}
