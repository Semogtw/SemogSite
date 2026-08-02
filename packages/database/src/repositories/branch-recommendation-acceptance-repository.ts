import type {
  BranchRecommendationAcceptanceAuditEvent,
  BranchRecommendationAcceptanceRepository,
  RepositoryBranchCandidate,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export class SqliteBranchRecommendationAcceptanceRepository
  implements BranchRecommendationAcceptanceRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findCandidate(
    repositoryId: string,
  ): Promise<RepositoryBranchCandidate | null> {
    const repository = this.database.$client
      .prepare(
        `SELECT id, full_name, active_branch, default_branch, updated_at
         FROM repositories
         WHERE id = ? AND status = 'active'`,
      )
      .get(repositoryId) as
      | {
          id: string;
          full_name: string;
          active_branch: string | null;
          default_branch: string;
          updated_at: string;
        }
      | undefined;
    if (repository === undefined) return null;

    const recommendation = this.latestRecommendation(repositoryId);
    return {
      repository: {
        id: repository.id,
        fullName: repository.full_name,
        activeBranch: repository.active_branch,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
      },
      recommendation:
        recommendation === undefined
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
    const transaction = this.database.$client.transaction(() => {
      const latest = this.latestRecommendation(before.repository.id);
      if (
        latest === undefined ||
        before.recommendation === null ||
        after.recommendation === null ||
        latest.id !== before.recommendation.id ||
        latest.id !== after.recommendation.id ||
        latest.status !== "recommended" ||
        latest.branch === null ||
        latest.branch !== after.repository.activeBranch
      ) {
        return false;
      }

      const update = this.database.$client
        .prepare(
          `UPDATE repositories
           SET active_branch = ?, updated_at = ?
           WHERE id = ?
             AND status = 'active'
             AND updated_at = ?
             AND (
               (? IS NULL AND active_branch IS NULL)
               OR active_branch = ?
             )`,
        )
        .run(
          after.repository.activeBranch,
          after.repository.updatedAt,
          before.repository.id,
          before.repository.updatedAt,
          before.repository.activeBranch,
          before.repository.activeBranch,
        );
      if (update.changes !== 1) return false;

      this.database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
      return true;
    });

    return transaction.immediate();
  }

  private latestRecommendation(repositoryId: string):
    | {
        id: string;
        status: "unavailable" | "recommended";
        branch: string | null;
        confidence: "high" | "medium" | "low";
        observed_at: string;
      }
    | undefined {
    return this.database.$client
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
      .get(repositoryId) as
      | {
          id: string;
          status: "unavailable" | "recommended";
          branch: string | null;
          confidence: "high" | "medium" | "low";
          observed_at: string;
        }
      | undefined;
  }
}
