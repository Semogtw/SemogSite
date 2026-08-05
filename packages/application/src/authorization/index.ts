export {
  createAgentCommandPolicy,
} from "./agent-command-policy";
export type {
  AgentCommandPolicyDependencies,
  AgentCommandPolicyMaterial,
} from "./agent-command-policy";
export {
  agentCapabilities,
  capabilityForCommand,
  domainForCapability,
  isAgentCapability,
  oauthScopeForCapability,
  resourceKindsForCapability,
} from "./capabilities";
export type { AgentAuthorizationDomain } from "./capabilities";
export {
  validateAgentAuthorizationCatalog,
} from "./catalog-coverage";
export type {
  AgentAuthorizationCommandEntry,
} from "./catalog-coverage";
export {
  planAgentClientRevocation,
} from "./client-revocation";
export type {
  AgentClientRevocationPlan,
} from "./client-revocation";
export {
  confirmationChallengeResponseBytes,
  confirmationChallengeTtlMinutes,
  createConfirmationChallengeService,
} from "./confirmation-challenge";
export type {
  ConfirmationChallengePublic,
  ConfirmationChallengeRecord,
  ConfirmationChallengeRisk,
  ConfirmationChallengeService,
  ConfirmationChallengeStatus,
  ConfirmationChallengeStore,
} from "./confirmation-challenge";
export {
  computeEffectiveAgentAuthorization,
} from "./effective-grant";
export {
  planAgentGrantCreation,
} from "./grant-creation";
export type {
  AgentGrantCreationPlan,
} from "./grant-creation";
export {
  validateAgentGrantRequest,
} from "./grant-request";
export type { AgentGrantRequest } from "./grant-request";
export {
  planAgentGrantRevocation,
} from "./grant-revocation";
export type {
  AgentGrantRevocationPlan,
} from "./grant-revocation";
export {
  createAgentAuthorizationMutationExecutor,
} from "./mutation-executor";
export type {
  AgentAuthorizationMutation,
  AgentAuthorizationMutationRepository,
  AgentAuthorizationMutationResult,
  AgentAuthorizationMutationStatus,
} from "./mutation-executor";
export {
  decideAgentCommandDisposition,
} from "./policy-engine";
export type {
  AgentCommandPolicyDecision,
  AgentCommandRisk,
} from "./policy-engine";
export {
  reviewedResourceKinds,
  selectorMatchesResource,
  validateResourceSelectorForKind,
} from "./resource-selectors";
export {
  defaultTrustDurationMinutes,
  defaultTrustMaximumOperations,
  evaluateTrustSessionState,
  maximumTrustDurationMinutes,
  maximumTrustOperations,
  minimumTrustDurationMinutes,
  trustSessionCoversCommand,
  trustSessionFitsAuthorization,
  validateTrustSessionRequest,
} from "./trust-session";
export type {
  TrustCoveredCommandRisk,
  TrustSessionState,
} from "./trust-session";
export {
  planAgentTrustSessionCreation,
} from "./trust-session-request";
export {
  planAgentTrustSessionRevocation,
} from "./trust-session-revocation";
export type {
  AgentTrustSessionRevocationPlan,
} from "./trust-session-revocation";
export type {
  AgentCapability,
  AgentGrantDefinition,
  AgentGrantStatus,
  AgentRiskCeiling,
  AgentTrustSession,
  CommandResource,
  CommandResourceParentRef,
  EffectiveAgentAuthorization,
  EffectiveAgentAuthorizationClause,
  OAuthScope,
  OAuthWriteScope,
  ResourceSelector,
  ResourceSelectorMap,
  TrustRiskCeiling,
} from "./types";
export {
  writesAllowed,
} from "./write-switches";
export type { AgentWriteSwitchState } from "./write-switches";
