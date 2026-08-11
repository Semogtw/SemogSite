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

type CooperativeRunTransitionCommonInput = {
  idempotencyKey: string;
  runId: string;
  expectedUpdatedAt: string;
  confirmed: true;
};

export type CooperativeRunTransitionInput =
  | (CooperativeRunTransitionCommonInput & {
      kind: "heartbeat";
      summary: string | null;
      phase: string | null;
      branch: string | null;
      nextAction: string | null;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "checkpoint";
      progress: number | null;
      summary: string;
      phase: string | null;
      branch: string | null;
      nextAction: string;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "block";
      progress: number | null;
      blocker: string;
      nextAction: string;
      summary: string | null;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "resume";
      progress: number | null;
      summary: string;
      phase: string | null;
      branch: string | null;
      nextAction: string;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "complete";
      progress: 100;
      summary: string;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "fail";
      reason: string;
      summary: string;
    })
  | (CooperativeRunTransitionCommonInput & {
      kind: "cancel";
      reason: string;
      summary: string | null;
    });

export type CooperativeRunTransitionResult = {
  runId: string;
  status: "running" | "blocked" | "completed" | "failed" | "cancelled";
  progress: number;
  updatedAt: string;
  processStarted: false;
};

export type CooperativeRunCheckpointTestsStatus =
  | "not_run"
  | "partial"
  | "passed"
  | "failed"
  | "blocked";

export type CooperativeRunCommandKind =
  | "continue"
  | "pause"
  | "cancel"
  | "reprioritize"
  | "request_checkpoint"
  | "provide_context";

type QueueCooperativeRunCommandCommonInput = {
  idempotencyKey: string;
  runId: string;
  summary: string;
  expiresAt: string | null;
  confirmed: true;
};

export type QueueCooperativeRunCommandInput =
  | (QueueCooperativeRunCommandCommonInput & {
      kind: "continue";
      note: string | null;
    })
  | (QueueCooperativeRunCommandCommonInput & {
      kind: "pause" | "cancel";
      reason: string;
    })
  | (QueueCooperativeRunCommandCommonInput & {
      kind: "reprioritize";
      priority: "low" | "normal" | "high";
      note: string | null;
    })
  | (QueueCooperativeRunCommandCommonInput & {
      kind: "request_checkpoint";
      include: readonly ("commits" | "tests" | "blockers" | "next_step")[];
    })
  | (QueueCooperativeRunCommandCommonInput & {
      kind: "provide_context";
      context: string;
    });

export type QueueCooperativeRunCommandResult = {
  commandId: string;
  runId: string;
  kind: CooperativeRunCommandKind;
  status: "queued";
  queuedAt: string;
  delivered: false;
  processControlTriggered: false;
};

export type RecordCooperativeRunCheckpointInput = {
  idempotencyKey: string;
  runId: string;
  expectedUpdatedAt: string;
  progress: number;
  phase: string | null;
  branch: string | null;
  summary: string;
  commits: readonly string[];
  testsStatus: CooperativeRunCheckpointTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  confirmed: true;
};

export type RecordCooperativeRunCheckpointResult = {
  runId: string;
  checkpointId: string;
  progress: number;
  testsStatus: CooperativeRunCheckpointTestsStatus;
  capturedAt: string;
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

export function transitionPrivateCooperativeRun(
  client: PrivateMutationClient,
  input: CooperativeRunTransitionInput,
): Promise<CooperativeRunTransitionResult> {
  return client.mutate<CooperativeRunTransitionResult>(
    "cooperative_run.transition",
    input,
  );
}

export function recordPrivateCooperativeRunCheckpoint(
  client: PrivateMutationClient,
  input: RecordCooperativeRunCheckpointInput,
): Promise<RecordCooperativeRunCheckpointResult> {
  return client.mutate<RecordCooperativeRunCheckpointResult>(
    "cooperative_run.checkpoint",
    input,
  );
}

export function queuePrivateCooperativeRunCommand(
  client: PrivateMutationClient,
  input: QueueCooperativeRunCommandInput,
): Promise<QueueCooperativeRunCommandResult> {
  return client.mutate<QueueCooperativeRunCommandResult>(
    "cooperative_run.command.queue",
    input,
  );
}
