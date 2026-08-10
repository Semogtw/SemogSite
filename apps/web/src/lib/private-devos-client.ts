import {
  createPrivateApiClient,
  findPrivateStateWriteCapability,
  type PrivateRuntimeCapabilities,
} from "./private-api-client";
import {
  transitionPrivateAttention,
  type AttentionLifecycleMutationInput,
  type AttentionLifecycleMutationResult,
} from "./private-attention-commands";
import {
  registerPrivateCooperativeRun,
  transitionPrivateCooperativeRun,
  type CooperativeRunTransitionInput,
  type CooperativeRunTransitionResult,
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
  recordPrivateManualEvidence,
  type RecordManualEvidenceInput,
  type RecordManualEvidenceResult,
} from "./private-evidence-commands";
import {
  getPrivateMutationRetryPolicy,
  type PrivateMutationRetryPolicy,
} from "./private-api-retry-policy";
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
  recordPrivateSessionHandoff,
  type RecordSessionHandoffInput,
  type RecordSessionHandoffResult,
} from "./private-session-handoff-commands";
import {
  overridePrivateScopeReservation,
  type OverrideScopeReservationInput,
  type ScopeReservationMutationResult,
} from "./private-scope-reservation-commands";
import {
  completePrivateStage,
  type StageCompletionMutationInput,
  type StageCompletionMutationResult,
} from "./private-stage-completion";

export type PrivateDevosClientOptions = Parameters<typeof createPrivateApiClient>[0];

export type PrivateDevosClient = {
  getCapabilities(refresh?: boolean): Promise<PrivateRuntimeCapabilities>;
  clearCapabilities(): void;
  mutate<T>(operation: string, payload: unknown): Promise<T>;
  getRetryPolicy(operation: string): Promise<PrivateMutationRetryPolicy>;
  attention: {
    transition(
      input: AttentionLifecycleMutationInput,
    ): Promise<AttentionLifecycleMutationResult>;
  };
  evidence: {
    record(
      input: RecordManualEvidenceInput,
    ): Promise<RecordManualEvidenceResult>;
  };
  handoffs: {
    record(
      input: RecordSessionHandoffInput,
    ): Promise<RecordSessionHandoffResult>;
  };
  scopes: {
    override(
      input: OverrideScopeReservationInput,
    ): Promise<ScopeReservationMutationResult>;
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
    transition(
      input: CooperativeRunTransitionInput,
    ): Promise<CooperativeRunTransitionResult>;
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

export function createPrivateDevosClient(
  options: PrivateDevosClientOptions,
): PrivateDevosClient {
  const api = createPrivateApiClient(options);
  return {
    getCapabilities: api.getCapabilities,
    clearCapabilities: api.clearCapabilities,
    mutate: api.mutate,
    async getRetryPolicy(operation) {
      let capabilities = await api.getCapabilities();
      let capability = capabilities.stateWriteEndpoints.find(
        (item) => item.name === operation,
      );
      if (capability === undefined) {
        capabilities = await api.getCapabilities(true);
        capability = findPrivateStateWriteCapability(capabilities, operation);
      }
      return getPrivateMutationRetryPolicy(capability);
    },
    attention: {
      transition: (input) => transitionPrivateAttention(api, input),
    },
    evidence: {
      record: (input) => recordPrivateManualEvidence(api, input),
    },
    handoffs: {
      record: (input) => recordPrivateSessionHandoff(api, input),
    },
    scopes: {
      override: (input) => overridePrivateScopeReservation(api, input),
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
      transition: (input) => transitionPrivateCooperativeRun(api, input),
    },
    editorial: {
      createRedirect: (input) => createPrivateEditorialRedirect(api, input),
      revokeRedirect: (input) => revokePrivateEditorialRedirect(api, input),
    },
  };
}
