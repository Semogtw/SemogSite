import type { PrivateMutationClient } from "./private-mutation-client";

export type VerificationFailureClassification =
  | "code_failure"
  | "environment_missing"
  | "flaky"
  | "timeout"
  | "quota"
  | "configuration"
  | "external_dependency"
  | "unknown";

export type VerificationObligationStatus =
  | "pending"
  | "passed"
  | "failed"
  | "blocked"
  | "superseded"
  | "waived";

export type VerificationObligationMutationSnapshot = {
  id: string;
  status: VerificationObligationStatus;
  version: number;
};

export type CreateVerificationObligationInput = {
  idempotencyKey: string;
  projectId: string | null;
  repositoryId: string;
  runId: string | null;
  stageId: string | null;
  branch: string;
  targetCommitSha: string;
  gateName: string;
  command: string;
  requiredCapabilities: string[];
  responsibleActor: string;
  nextAction: string;
  toolchainManifest: string | null;
  confirmed: true;
};

export type CreateVerificationObligationResult = {
  obligation: VerificationObligationMutationSnapshot;
  gateExecuted: false;
};

export type RecordVerificationObligationResultInput = {
  idempotencyKey: string;
  obligationId: string;
  expectedVersion: number;
  outcome: "passed" | "failed" | "blocked";
  failureClassification: VerificationFailureClassification | null;
  resultSummary: string;
  evidenceUrls: string[];
  nextAction: string;
  confirmed: true;
};

export type RecordVerificationObligationResultResult = {
  obligation: VerificationObligationMutationSnapshot;
  gateExecuted: false;
};

export type SupersedeVerificationObligationInput = {
  idempotencyKey: string;
  obligationId: string;
  expectedVersion: number;
  reason: string;
  confirmed: true;
};

export type WaiveVerificationObligationInput = SupersedeVerificationObligationInput;

export type VerificationObligationLifecycleResult = {
  obligation: VerificationObligationMutationSnapshot;
};

export function createPrivateVerificationObligation(
  client: PrivateMutationClient,
  input: CreateVerificationObligationInput,
): Promise<CreateVerificationObligationResult> {
  return client.mutate<CreateVerificationObligationResult>(
    "verification_obligation.create",
    input,
  );
}

export function recordPrivateVerificationObligationResult(
  client: PrivateMutationClient,
  input: RecordVerificationObligationResultInput,
): Promise<RecordVerificationObligationResultResult> {
  return client.mutate<RecordVerificationObligationResultResult>(
    "verification_obligation.result",
    input,
  );
}

export function supersedePrivateVerificationObligation(
  client: PrivateMutationClient,
  input: SupersedeVerificationObligationInput,
): Promise<VerificationObligationLifecycleResult> {
  return client.mutate<VerificationObligationLifecycleResult>(
    "verification_obligation.supersede",
    input,
  );
}

export function waivePrivateVerificationObligation(
  client: PrivateMutationClient,
  input: WaiveVerificationObligationInput,
): Promise<VerificationObligationLifecycleResult> {
  return client.mutate<VerificationObligationLifecycleResult>(
    "verification_obligation.waive",
    input,
  );
}
