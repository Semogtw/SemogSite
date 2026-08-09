import type {
  BranchRecommendationAcceptanceAuditEvent,
  BranchRecommendationAcceptanceRepository,
  RepositoryBranchCandidate,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

type RepositoryRow = {
  id: string;
  full_name: string;
  active_branch: string | null;
  default_branch: string;
  updated_at: string;
};

type RecommendationRow = {
  id: string;
  status: "unavailable" | "recommended";
  branch: string | null;
  confidence: "high" | "medium" | "low";
  observed_at: string;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 branch recommendation acceptance batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 branch recommendation acceptance result is missing changes metadata.",
    );
  }
  return changes;
}

export class D1BranchRecommendationAcceptanceRepository
  implements BranchRecommendationAcceptanceRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async findCandidate(repositoryId: string): Promise<RepositoryBranchCandidate | null> {
    const repository = await this.database
      .prepare(
        `SELECT id, full_name, active_branch, default_branch, updated_at
        FROM repositories
        WHERE id = ? AND status = 'active'
        LIMIT 1`,
      )
      .bind(repositoryId)
      .first<RepositoryRow>();
    if (repository === null) return null;

    const recommendation = await this.database
      .prepare(
        `SELECT recommendation.id,
                recommendation.status,
                recommendation.branch,
                recommendation.confidence,
                recommendation.observed_at
        FROM github_branch_recommendations AS recommendation
        INNER JOIN github_repository_observations AS observation
          ON observation.id = recommendation.repository_observation_id
        WHERE recommendation.repository_id = ?
        ORDER BY observation.observed_at DESC, recommendation.id DESC
        LIMIT 1`,
      )
      .bind(repositoryId)
      .first<RecommendationRow>();

    return {
      repository: {
        id: repository.id,
        fullName: repository.full_name,
        activeBranch: repository.active_branch,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
      },
      recommendation:
        recommendation === null
          ? null
          : {
              id: recommendation.id,
              status: recommendation.status,
              branch: recommendation.branch,
              confidence: recommendation.confidence,
              observedAt: recommendation.observed_at,
            },
    };
  }

  async acceptWithAudit(
    before: RepositoryBranchCandidate,
    after: RepositoryBranchCandidate,
    audit: BranchRecommendationAcceptanceAuditEvent,
  ): Promise<boolean> {
    if (before.recommendation === null || after.recommendation === null) {
      return false;
    }
    const recommendationId = before.recommendation.id;
    if (
      recommendationId !== after.recommendation.id ||
      after.recommendation.status !== "recommended" ||
      after.repository.activeBranch === null
    ) {
      return false;
    }

    const update = this.database
      .prepare(
        `UPDATE repositories
        SET active_branch = ?, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND updated_at = ?
          AND ((? IS NULL AND active_branch IS NULL) OR active_branch = ?)
          AND EXISTS (
            SELECT 1
            FROM github_branch_recommendations AS recommendation
            INNER JOIN github_repository_observations AS observation
              ON observation.id = recommendation.repository_observation_id
            WHERE recommendation.repository_id = ?
              AND recommendation.id = ?
              AND recommendation.status = 'recommended'
              AND recommendation.branch = ?
              AND recommendation.id = (
                SELECT latest.id
                FROM github_branch_recommendations AS latest
                INNER JOIN github_repository_observations AS latest_observation
                  ON latest_observation.id = latest.repository_observation_id
                WHERE latest.repository_id = ?
                ORDER BY latest_observation.observed_at DESC, latest.id DESC
                LIMIT 1
              )
          )`,
      )
      .bind(
        after.repository.activeBranch,
        after.repository.updatedAt,
        before.repository.id,
        before.repository.updatedAt,
        before.repository.activeBranch,
        before.repository.activeBranch,
        before.repository.id,
        recommendationId,
        after.repository.activeBranch,
        before.repository.id,
      );

    const auditInsert = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([update, auditInsert]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 branch recommendation acceptance changed multiple rows.");
    }
    return changed === 1;
  }
}
