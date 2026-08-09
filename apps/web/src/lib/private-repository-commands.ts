import type { PrivateMutationClient } from "./private-mutation-client";

export type RepositoryRole =
  | "product"
  | "core"
  | "integration"
  | "infrastructure"
  | "academic"
  | "experiment";

export type RegisterRepositoryTargetInput = {
  projectId: string;
  fullName: string;
  defaultBranch: string;
  role: RepositoryRole;
  reason: string;
  confirmed: true;
};

export type RegisterRepositoryTargetResult = {
  repositoryId: string;
  fullName: string;
  projectId: string;
  role: RepositoryRole;
};

export type ChangeRepositoryTargetInput = {
  repositoryId: string;
  desiredSyncEnabled: boolean;
  expectedSyncEnabled: boolean;
  expectedUpdatedAt: string;
  reason: string;
  confirmed: true;
};

export type ChangeRepositoryTargetResult = {
  repositoryId: string;
  syncEnabled: boolean;
  updatedAt: string;
};

export type AcceptBranchRecommendationInput = {
  repositoryId: string;
  recommendationId: string;
  expectedActiveBranch: string | null;
  reason: string;
  confirmed: true;
};

export type AcceptBranchRecommendationResult = {
  repositoryId: string;
  activeBranch: string | null;
  updatedAt: string;
  recommendationId: string | null;
};

export function registerPrivateRepositoryTarget(
  client: PrivateMutationClient,
  input: RegisterRepositoryTargetInput,
): Promise<RegisterRepositoryTargetResult> {
  return client.mutate<RegisterRepositoryTargetResult>(
    "repository.sync_target.register",
    input,
  );
}

export function changePrivateRepositoryTarget(
  client: PrivateMutationClient,
  input: ChangeRepositoryTargetInput,
): Promise<ChangeRepositoryTargetResult> {
  return client.mutate<ChangeRepositoryTargetResult>(
    "repository.sync_target.change",
    input,
  );
}

export function acceptPrivateBranchRecommendation(
  client: PrivateMutationClient,
  input: AcceptBranchRecommendationInput,
): Promise<AcceptBranchRecommendationResult> {
  return client.mutate<AcceptBranchRecommendationResult>(
    "repository.active_branch.accept",
    input,
  );
}
