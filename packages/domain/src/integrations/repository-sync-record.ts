import type {
  BranchObservation,
  BranchRecommendation,
  ObservationConfidence,
} from "./repository-observation";

export type RepositoryObservationRecord = {
  id: string;
  syncRunId: string;
  repositoryId: string;
  githubNodeId: string;
  fullName: string;
  visibility: "public" | "private";
  defaultBranch: string;
  htmlUrl: string;
  archived: boolean;
  pushedAt: string | null;
  providerUpdatedAt: string;
  observedAt: string;
  apiVersion: string;
  etag: string | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  branchesTruncated: boolean;
  sourceHash: string;
};

export type BranchObservationRecord = BranchObservation & {
  id: string;
  repositoryObservationId: string;
  repositoryId: string;
  isDefault: boolean;
  observedAt: string;
  sourceHash: string;
};

export type BranchRecommendationRecord = {
  id: string;
  repositoryObservationId: string;
  repositoryId: string;
  status: BranchRecommendation["status"];
  branch: string | null;
  confidence: ObservationConfidence;
  reason: string;
  warnings: readonly string[];
  evidence: readonly unknown[];
  observedAt: string;
  sourceHash: string;
};

export type RepositoryObservationAggregate = {
  repository: RepositoryObservationRecord;
  branches: readonly BranchObservationRecord[];
  recommendation: BranchRecommendationRecord;
};

export type ObservationInsertResult = "inserted" | "duplicate";

export interface RepositoryObservationStore {
  insertObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<ObservationInsertResult>;
}

export type LatestRepositoryRecommendation = {
  repositoryId: string;
  fullName: string;
  observedAt: string;
  apiVersion: string;
  branchesTruncated: boolean;
  status: BranchRecommendation["status"];
  branch: string | null;
  confidence: ObservationConfidence;
  reason: string;
  warnings: readonly string[];
  evidence: readonly unknown[];
  malformedJson: readonly ("warnings" | "evidence")[];
};
