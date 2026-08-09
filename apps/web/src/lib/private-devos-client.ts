import {
  createPrivateApiClient,
  type PrivateRuntimeCapabilities,
} from "./private-api-client";
import {
  transitionPrivateAttention,
  type AttentionLifecycleMutationInput,
  type AttentionLifecycleMutationResult,
} from "./private-attention-commands";
import {
  registerPrivateCooperativeRun,
  type RegisterCooperativeRunInput,
  type RegisterCooperativeRunResult,
} from "./private-cooperative-run-commands";
import {
  createPrivateEditorialRedirect,
  revokePrivateEditorialRedirect,
  type EditorialRedirectMutationInput,
  type EditorialRedirectMutationResult,
} from "./private-editorial-redirect-commands";
import {
  acceptPrivateBranchRecommendation,
  changePrivateRepositoryTarget,
  registerPrivateRepositoryTarget,
  type AcceptBranchRecommendationInput,
  type AcceptBranchRecommendationResult,
  type ChangeRepositoryTargetInput,
  type ChangeRepositoryTargetResult,
  type RegisterRepositoryTargetInput,
  type RegisterRepositoryTargetResult,
} from "./private-repository-commands";
import {
  completePrivateStage,
  type StageCompletionMutationInput,
  type StageCompletionMutationResult,
} from "./private-stage-completion";

export type PrivateDevosClientOptions = Parameters<typeof createPrivateApiClient>[0];

export type PrivateDevosClient = {
  getCapabilities(refresh?: boolean): Promise<PrivateRuntimeCapabilities>;
  clearCapabilities(): void;
  attention: {
    transition(
      input: AttentionLifecycleMutationInput,
    ): Promise<AttentionLifecycleMutationResult>;
  };
  stages: {
    complete(
      input: StageCompletionMutationInput,
    ): Promise<StageCompletionMutationResult>;
  };
  repositories: {
    registerTarget(
      input: RegisterRepositoryTargetInput,
    ): Promise<RegisterRepositoryTargetResult>;
    changeTarget(
      input: ChangeRepositoryTargetInput,
    ): Promise<ChangeRepositoryTargetResult>;
    acceptBranchRecommendation(
      input: AcceptBranchRecommendationInput,
    ): Promise<AcceptBranchRecommendationResult>;
  };
  runs: {
    register(
      input: RegisterCooperativeRunInput,
    ): Promise<RegisterCooperativeRunResult>;
  };
  editorial: {
    createRedirect(
      input: EditorialRedirectMutationInput,
    ): Promise<EditorialRedirectMutationResult>;
    revokeRedirect(
      input: EditorialRedirectMutationInput,
    ): Promise<EditorialRedirectMutationResult>;
  };
};

/**
 * High-level browser facade over the private canonical-state API.
 *
 * Components call domain-shaped methods while operation discovery, endpoint
 * selection, CSRF transport and response-metadata validation stay centralized.
 */
export function createPrivateDevosClient(
  options: PrivateDevosClientOptions,
): PrivateDevosClient {
  const api = createPrivateApiClient(options);
  return {
    getCapabilities: api.getCapabilities,
    clearCapabilities: api.clearCapabilities,
    attention: {
      transition: (input) => transitionPrivateAttention(api, input),
    },
    stages: {
      complete: (input) => completePrivateStage(api, input),
    },
    repositories: {
      registerTarget: (input) => registerPrivateRepositoryTarget(api, input),
      changeTarget: (input) => changePrivateRepositoryTarget(api, input),
      acceptBranchRecommendation: (input) =>
        acceptPrivateBranchRecommendation(api, input),
    },
    runs: {
      register: (input) => registerPrivateCooperativeRun(api, input),
    },
    editorial: {
      createRedirect: (input) => createPrivateEditorialRedirect(api, input),
      revokeRedirect: (input) => revokePrivateEditorialRedirect(api, input),
    },
  };
}
