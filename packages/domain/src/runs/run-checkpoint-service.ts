import {
  applyRunTransition,
  type CooperativeRunOrigin,
  type CooperativeRunSnapshot,
  type RunStateValidationError,
  type RunTransitionValidationError,
} from "./run-state";
import type { CooperativeRunEvent } from "./run-transition-service";

export type CooperativeRunCheckpointTestsStatus =
  | "not_run"
  | "partial"
  | "passed"
  | "failed"
  | "blocked";

export type RecordCooperativeRunCheckpointInput = {
  runId: string;
  progress?: number;
  phase: string | null;
  branch: string | null;
  summary: string;
  commits: readonly string[];
  testsStatus: CooperativeRunCheckpointTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
};

export type CooperativeRunCheckpointContext = {
  actorId: string;
  eventId: string;
  checkpointId: string;
  idempotencyKey: string;
  correlationId: string;
  sourceHash: string;
  source: CooperativeRunOrigin;
  now: string;
  expectedUpdatedAt: string;
};

export type CooperativeRunCheckpointEvent = CooperativeRunEvent & {
  kind: "run.checkpoint";
};

export type CooperativeRunCheckpoint = {
  id: string;
  runId: string;
  eventId: string;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  commits: readonly string[];
  testsStatus: CooperativeRunCheckpointTestsStatus;
  testsSummary: string;
  blockers: string;
  nextStep: string;
  capturedAt: string;
  sourceHash: string;
};

export type CooperativeRunCheckpointStoreResult =
  | "recorded"
  | "duplicate"
  | "conflict";

export interface CooperativeRunCheckpointRepository {
  findRun(runId: string): Promise<CooperativeRunSnapshot | null>;
  record(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunCheckpointEvent,
    checkpoint: CooperativeRunCheckpoint,
  ): Promise<CooperativeRunCheckpointStoreResult>;
}

export type CooperativeRunCheckpointValidationError =
  | "RUN_ID_REQUIRED"
  | "EVENT_ID_REQUIRED"
  | "CHECKPOINT_ID_REQUIRED"
  | "ACTOR_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "SOURCE_HASH_REQUIRED"
  | "PHASE_TOO_LONG"
  | "BRANCH_INVALID"
  | "SUMMARY_REQUIRED"
  | "SUMMARY_TOO_LONG"
  | "COMMIT_INVALID"
  | "TOO_MANY_COMMITS"
  | "TESTS_STATUS_INVALID"
  | "TESTS_SUMMARY_REQUIRED"
  | "TESTS_SUMMARY_TOO_LONG"
  | "BLOCKERS_TOO_LONG"
  | "NEXT_STEP_REQUIRED"
  | "NEXT_STEP_TOO_LONG";

export type CooperativeRunCheckpointResult =
  | {
      ok: true;
      run: CooperativeRunSnapshot;
      event: CooperativeRunCheckpointEvent;
      checkpoint: CooperativeRunCheckpoint;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly (
        | CooperativeRunCheckpointValidationError
        | RunTransitionValidationError
      )[];
    }
  | {
      ok: false;
      code: "INVALID_CURRENT_STATE";
      errors: readonly RunStateValidationError[];
    }
  | {
      ok: false;
      code:
        | "RUN_NOT_FOUND"
        | "STALE_STATE"
        | "TERMINAL_RUN"
        | "DUPLICATE"
        | "CONFLICT";
    };

const commitPattern = /^[0-9a-f]{7,64}$/u;
const branchCharacterPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const testsStatuses = new Set<CooperativeRunCheckpointTestsStatus>([
  "not_run",
  "partial",
  "passed",
  "failed",
  "blocked",
]);

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = text(value);
  return normalized.length === 0 ? null : normalized;
}

function safeBranch(value: string): boolean {
  return (
    branchCharacterPattern.test(value) &&
    !/[~^:?*[\\]/u.test(value) &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.startsWith(".") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock") &&
    !value.includes("..") &&
    !value.includes("@{") &&
    !value.includes("//")
  );
}

function normalizeCommits(values: readonly string[]): {
  commits: string[];
  invalid: boolean;
} {
  const commits: string[] = [];
  const seen = new Set<string>();
  let invalid = false;

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!commitPattern.test(normalized)) {
      invalid = true;
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    commits.push(normalized);
  }

  return { commits, invalid };
}

export class CooperativeRunCheckpointService {
  constructor(
    private readonly repository: CooperativeRunCheckpointRepository,
  ) {}

  async record(
    input: RecordCooperativeRunCheckpointInput,
    context: CooperativeRunCheckpointContext,
  ): Promise<CooperativeRunCheckpointResult> {
    const runId = text(input.runId);
    const eventId = text(context.eventId);
    const checkpointId = text(context.checkpointId);
    const actorId = text(context.actorId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    const sourceHash = text(context.sourceHash);
    const phase = nullableText(input.phase);
    const branch = nullableText(input.branch);
    const summary = text(input.summary);
    const testsSummary = text(input.testsSummary);
    const blockers = text(input.blockers);
    const nextStep = text(input.nextStep);
    const normalizedCommits = normalizeCommits(input.commits);
    const errors: CooperativeRunCheckpointValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (eventId.length === 0) errors.push("EVENT_ID_REQUIRED");
    if (checkpointId.length === 0) errors.push("CHECKPOINT_ID_REQUIRED");
    if (actorId.length === 0) errors.push("ACTOR_ID_REQUIRED");
    if (idempotencyKey.length === 0) {
      errors.push("IDEMPOTENCY_KEY_REQUIRED");
    }
    if (correlationId.length === 0) {
      errors.push("CORRELATION_ID_REQUIRED");
    }
    if (sourceHash.length === 0) errors.push("SOURCE_HASH_REQUIRED");
    if (phase !== null && phase.length > 200) errors.push("PHASE_TOO_LONG");
    if (branch !== null && !safeBranch(branch)) errors.push("BRANCH_INVALID");
    if (summary.length === 0) errors.push("SUMMARY_REQUIRED");
    else if (summary.length > 2_000) errors.push("SUMMARY_TOO_LONG");
    if (normalizedCommits.invalid) errors.push("COMMIT_INVALID");
    if (normalizedCommits.commits.length > 100) errors.push("TOO_MANY_COMMITS");
    if (!testsStatuses.has(input.testsStatus)) {
      errors.push("TESTS_STATUS_INVALID");
    }
    if (testsSummary.length === 0) errors.push("TESTS_SUMMARY_REQUIRED");
    else if (testsSummary.length > 2_000) {
      errors.push("TESTS_SUMMARY_TOO_LONG");
    }
    if (blockers.length > 2_000) errors.push("BLOCKERS_TOO_LONG");
    if (nextStep.length === 0) errors.push("NEXT_STEP_REQUIRED");
    else if (nextStep.length > 1_000) errors.push("NEXT_STEP_TOO_LONG");

    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findRun(runId);
    if (before === null) return { ok: false, code: "RUN_NOT_FOUND" };

    const transition = applyRunTransition(
      before,
      {
        kind: "checkpoint",
        ...(input.progress === undefined ? {} : { progress: input.progress }),
        summary,
        phase,
        branch,
        nextAction: nextStep,
      },
      {
        now: context.now,
        expectedUpdatedAt: context.expectedUpdatedAt,
      },
    );
    if (!transition.ok) return transition;

    const event: CooperativeRunCheckpointEvent = {
      id: eventId,
      runId,
      kind: "run.checkpoint",
      actor: actorId,
      source: context.source,
      summary: transition.event.summary,
      before: transition.before,
      after: transition.after,
      occurredAt: transition.event.occurredAt,
      idempotencyKey,
      correlationId,
    };
    const checkpoint: CooperativeRunCheckpoint = {
      id: checkpointId,
      runId,
      eventId,
      phase: transition.after.phase,
      progress: transition.after.progress,
      branch: transition.after.branch,
      summary: transition.after.summary,
      commits: normalizedCommits.commits,
      testsStatus: input.testsStatus,
      testsSummary,
      blockers,
      nextStep,
      capturedAt: transition.after.updatedAt,
      sourceHash,
    };

    const stored = await this.repository.record(
      transition.before,
      transition.after,
      event,
      checkpoint,
    );
    if (stored === "recorded") {
      return { ok: true, run: transition.after, event, checkpoint };
    }
    if (stored === "duplicate") return { ok: false, code: "DUPLICATE" };
    return { ok: false, code: "CONFLICT" };
  }
}
