import type { PrivateMutationClient } from "./private-mutation-client";

export type EvidenceKind =
  | "commit"
  | "pull_request"
  | "issue"
  | "workflow_run"
  | "test"
  | "document"
  | "manual_note";

export type EvidenceStatus =
  | "observed"
  | "passed"
  | "failed"
  | "pending"
  | "superseded";

export type RecordManualEvidenceInput = {
  projectId: string;
  stageId: string | null;
  kind: EvidenceKind;
  title: string;
  url: string | null;
  externalId: string | null;
  status: EvidenceStatus;
  summary: string;
  reason: string;
  confirmed: true;
};

export type RecordManualEvidenceResult = {
  evidenceId: string;
};

export function recordPrivateManualEvidence(
  client: PrivateMutationClient,
  input: RecordManualEvidenceInput,
): Promise<RecordManualEvidenceResult> {
  return client.mutate<RecordManualEvidenceResult>("evidence.record", input);
}
