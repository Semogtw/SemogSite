import type {
  LatestRepositoryRecommendation,
  ObservationInsertResult,
  RepositoryObservationAggregate,
  RepositoryObservationStore,
} from "@semogtw/domain";
import { desc, eq } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import {
  githubBranchObservations,
  githubBranchRecommendations,
  githubRepositoryObservations,
} from "../schema/github";

function parseStringArray(
  value: string,
  field: "warnings",
  malformed: Array<"warnings" | "evidence">,
): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      malformed.push(field);
      return [];
    }
    return parsed;
  } catch {
    malformed.push(field);
    return [];
  }
}

function parseEvidenceArray(
  value: string,
  field: "evidence",
  malformed: Array<"warnings" | "evidence">,
): readonly unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      malformed.push(field);
      return [];
    }
    return parsed;
  } catch {
    malformed.push(field);
    return [];
  }
}

export class SqliteGitHubObservationRepository
  implements RepositoryObservationStore
{
  constructor(private readonly database: SqliteDatabase) {}

  async insertObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<ObservationInsertResult> {
    return this.database.transaction((transaction) => {
      const parent = transaction
        .insert(githubRepositoryObservations)
        .values({
          id: observation.repository.id,
          syncRunId: observation.repository.syncRunId,
          repositoryId: observation.repository.repositoryId,
          githubNodeId: observation.repository.githubNodeId,
          fullName: observation.repository.fullName,
          visibility: observation.repository.visibility,
          defaultBranch: observation.repository.defaultBranch,
          htmlUrl: observation.repository.htmlUrl,
          archived: observation.repository.archived,
          pushedAt: observation.repository.pushedAt,
          providerUpdatedAt: observation.repository.providerUpdatedAt,
          observedAt: observation.repository.observedAt,
          apiVersion: observation.repository.apiVersion,
          etag: observation.repository.etag,
          rateLimitRemaining: observation.repository.rateLimitRemaining,
          rateLimitResetAt: observation.repository.rateLimitResetAt,
          branchesTruncated: observation.repository.branchesTruncated,
          sourceHash: observation.repository.sourceHash,
        })
        .onConflictDoNothing({
          target: githubRepositoryObservations.sourceHash,
        })
        .run();

      if (parent.changes === 0) return "duplicate";

      if (observation.branches.length > 0) {
        transaction
          .insert(githubBranchObservations)
          .values(
            observation.branches.map((branch) => ({
              id: branch.id,
              repositoryObservationId: branch.repositoryObservationId,
              repositoryId: branch.repositoryId,
              name: branch.name,
              headSha: branch.headSha,
              committedAt: branch.committedAt,
              protected: branch.protected,
              isDefault: branch.isDefault,
              observedAt: branch.observedAt,
              sourceHash: branch.sourceHash,
            })),
          )
          .run();
      }

      transaction
        .insert(githubBranchRecommendations)
        .values({
          id: observation.recommendation.id,
          repositoryObservationId:
            observation.recommendation.repositoryObservationId,
          repositoryId: observation.recommendation.repositoryId,
          status: observation.recommendation.status,
          branch: observation.recommendation.branch,
          confidence: observation.recommendation.confidence,
          reason: observation.recommendation.reason,
          warningsJson: JSON.stringify(observation.recommendation.warnings),
          evidenceJson: JSON.stringify(observation.recommendation.evidence),
          observedAt: observation.recommendation.observedAt,
          sourceHash: observation.recommendation.sourceHash,
        })
        .run();

      return "inserted";
    });
  }

  async latestRecommendation(
    repositoryId: string,
  ): Promise<LatestRepositoryRecommendation | null> {
    const row = this.database
      .select({
        repositoryId: githubRepositoryObservations.repositoryId,
        fullName: githubRepositoryObservations.fullName,
        observedAt: githubRepositoryObservations.observedAt,
        apiVersion: githubRepositoryObservations.apiVersion,
        branchesTruncated: githubRepositoryObservations.branchesTruncated,
        status: githubBranchRecommendations.status,
        branch: githubBranchRecommendations.branch,
        confidence: githubBranchRecommendations.confidence,
        reason: githubBranchRecommendations.reason,
        warningsJson: githubBranchRecommendations.warningsJson,
        evidenceJson: githubBranchRecommendations.evidenceJson,
      })
      .from(githubBranchRecommendations)
      .innerJoin(
        githubRepositoryObservations,
        eq(
          githubBranchRecommendations.repositoryObservationId,
          githubRepositoryObservations.id,
        ),
      )
      .where(eq(githubRepositoryObservations.repositoryId, repositoryId))
      .orderBy(
        desc(githubRepositoryObservations.observedAt),
        desc(githubBranchRecommendations.id),
      )
      .get();

    if (row === undefined) return null;
    const malformedJson: Array<"warnings" | "evidence"> = [];
    return {
      repositoryId: row.repositoryId,
      fullName: row.fullName,
      observedAt: row.observedAt,
      apiVersion: row.apiVersion,
      branchesTruncated: row.branchesTruncated,
      status: row.status,
      branch: row.branch,
      confidence: row.confidence,
      reason: row.reason,
      warnings: parseStringArray(row.warningsJson, "warnings", malformedJson),
      evidence: parseEvidenceArray(row.evidenceJson, "evidence", malformedJson),
      malformedJson,
    };
  }
}
