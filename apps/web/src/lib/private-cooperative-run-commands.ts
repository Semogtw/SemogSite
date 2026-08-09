import type { PrivateMutationClient } from "./private-mutation-client";

export type CooperativeRunOrigin =
  | "chatgpt"
  | "codex"
  | "manual"
  | "automation"
  | "other";

export type RegisterCooperativeRunInput = {
  idempotencyKey: string;
  projectId: string | null;
  title: string;
  actorLabel: string;
  origin: CooperativeRunOrigin;
  phase: string | null;
  branch: string | null;
  initialSummary: string;
  nextAction: string;
  staleAfterSeconds: number;
  confirmed: true;
};

export type RegisterCooperativeRunResult = {
  runId: string;
  title: string;
  status: "running";
  updatedAt: string;
  processStarted: false;
};

export function registerPrivateCooperativeRun(
  client: PrivateMutationClient,
  input: RegisterCooperativeRunInput,
): Promise<RegisterCooperativeRunResult> {
  return client.mutate<RegisterCooperativeRunResult>(
    "cooperative_run.register",
    input,
  );
}
