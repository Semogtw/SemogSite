import type { PrivateMutationClient } from "./private-mutation-client";

export type SessionHandoffTestsStatus =
  | "not_run"
  | "partial"
  | "passed"
  | "failed"
  | "blocked";

export type SessionHandoffResult =
  | "significant"
  | "partial"
  | "maintenance"
  | "no_change"
  | "failed";

export type RecordSessionHandoffInput = {
  projectId: string | null;
  title: string;
  branch: string | null;
  commits: string[];
  completedSummary: string;
  testsStatus: SessionHandoffTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  result: SessionHandoffResult;
  reason: string;
  confirmed: true;
};

export type RecordSessionHandoffResult = {
  sessionId: string;
};

export function recordPrivateSessionHandoff(
  client: PrivateMutationClient,
  input: RecordSessionHandoffInput,
): Promise<RecordSessionHandoffResult> {
  return client.mutate<RecordSessionHandoffResult>(
    "session_handoff.create",
    input,
  );
}
