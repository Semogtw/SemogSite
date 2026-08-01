export type CooperativeRunOrigin =
  | "chatgpt"
  | "codex"
  | "manual"
  | "automation"
  | "other";

export type CooperativeRunStatus =
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type CooperativeRunSnapshot = {
  id: string;
  projectId: string | null;
  title: string;
  actorLabel: string;
  origin: CooperativeRunOrigin;
  status: CooperativeRunStatus;
  phase: string | null;
  progress: number;
  branch: string | null;
  summary: string;
  blocker: string | null;
  nextAction: string | null;
  startedAt: string;
  lastHeartbeatAt: string;
  finishedAt: string | null;
  staleAfterSeconds: number;
  updatedAt: string;
};

export type RunFreshness = {
  status: "current" | "stale";
  staleAt: string | null;
};

export type RunTransitionContext = {
  now: string;
  expectedUpdatedAt: string;
};

export type RunTransitionCommand =
  | {
      kind: "heartbeat";
      summary?: string;
      phase?: string | null;
      branch?: string | null;
      nextAction?: string;
    }
  | {
      kind: "checkpoint";
      progress?: number;
      summary: string;
      phase?: string | null;
      branch?: string | null;
      nextAction: string;
    }
  | {
      kind: "block";
      progress?: number;
      blocker: string;
      nextAction: string;
      summary?: string;
    }
  | {
      kind: "resume";
      progress?: number;
      summary: string;
      phase?: string | null;
      branch?: string | null;
      nextAction: string;
    }
  | {
      kind: "complete";
      progress: number;
      summary: string;
    }
  | {
      kind: "fail";
      reason: string;
      summary: string;
    }
  | {
      kind: "cancel";
      reason: string;
      summary?: string;
    };

export type RunTransitionEventKind =
  | "run.heartbeat"
  | "run.checkpoint"
  | "run.blocked"
  | "run.resumed"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export type RunTransitionEventProposal = {
  kind: RunTransitionEventKind;
  occurredAt: string;
  summary: string;
};

export type RunStateValidationError =
  | "RUN_ID_REQUIRED"
  | "TITLE_REQUIRED"
  | "ACTOR_LABEL_REQUIRED"
  | "ORIGIN_INVALID"
  | "STATUS_INVALID"
  | "PROGRESS_INVALID"
  | "STALE_THRESHOLD_INVALID"
  | "STARTED_AT_INVALID"
  | "HEARTBEAT_AT_INVALID"
  | "UPDATED_AT_INVALID"
  | "FINISHED_AT_INVALID"
  | "HEARTBEAT_PRECEDES_START"
  | "UPDATE_PRECEDES_HEARTBEAT"
  | "RUNNING_BLOCKER_FORBIDDEN"
  | "RUNNING_NEXT_ACTION_REQUIRED"
  | "BLOCKED_BLOCKER_REQUIRED"
  | "BLOCKED_NEXT_ACTION_REQUIRED"
  | "NONTERMINAL_FINISHED_AT_FORBIDDEN"
  | "COMPLETED_PROGRESS_INVALID"
  | "COMPLETED_BLOCKER_FORBIDDEN"
  | "COMPLETED_NEXT_ACTION_FORBIDDEN"
  | "TERMINAL_REASON_REQUIRED"
  | "TERMINAL_NEXT_ACTION_FORBIDDEN"
  | "TERMINAL_FINISHED_AT_REQUIRED";

export type RunTransitionValidationError =
  | "TRANSITION_TIME_INVALID"
  | "EXPECTED_UPDATED_AT_INVALID"
  | "TRANSITION_TIME_PRECEDES_STATE"
  | "PROGRESS_INVALID"
  | "PROGRESS_REGRESSION"
  | "SUMMARY_REQUIRED"
  | "BLOCKER_REQUIRED"
  | "NEXT_ACTION_REQUIRED"
  | "REASON_REQUIRED"
  | "INVALID_TRANSITION";

export type RunTransitionResult =
  | {
      ok: true;
      before: CooperativeRunSnapshot;
      after: CooperativeRunSnapshot;
      event: RunTransitionEventProposal;
    }
  | {
      ok: false;
      code: "INVALID_CURRENT_STATE";
      errors: readonly RunStateValidationError[];
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly RunTransitionValidationError[];
    }
  | { ok: false; code: "STALE_STATE" | "TERMINAL_RUN" };

const origins = new Set<CooperativeRunOrigin>([
  "chatgpt",
  "codex",
  "manual",
  "automation",
  "other",
]);
const statuses = new Set<CooperativeRunStatus>([
  "running",
  "blocked",
  "completed",
  "failed",
  "cancelled",
]);
const terminalStatuses = new Set<CooperativeRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);
const minimumStaleSeconds = 5 * 60;
const maximumStaleSeconds = 24 * 60 * 60;

function normalizedText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizedNullableText(
  value: string | null | undefined,
): string | null {
  const normalized = normalizedText(value);
  return normalized.length === 0 ? null : normalized;
}

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function validProgress(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function validateRunState(
  run: CooperativeRunSnapshot,
): RunStateValidationError[] {
  const errors: RunStateValidationError[] = [];
  const startedAt = normalizedIso(run.startedAt);
  const heartbeatAt = normalizedIso(run.lastHeartbeatAt);
  const updatedAt = normalizedIso(run.updatedAt);
  const finishedAt =
    run.finishedAt === null ? null : normalizedIso(run.finishedAt);

  if (normalizedText(run.id).length === 0) errors.push("RUN_ID_REQUIRED");
  if (normalizedText(run.title).length === 0) errors.push("TITLE_REQUIRED");
  if (normalizedText(run.actorLabel).length === 0) {
    errors.push("ACTOR_LABEL_REQUIRED");
  }
  if (!origins.has(run.origin)) errors.push("ORIGIN_INVALID");
  if (!statuses.has(run.status)) errors.push("STATUS_INVALID");
  if (!validProgress(run.progress)) errors.push("PROGRESS_INVALID");
  if (
    !Number.isInteger(run.staleAfterSeconds) ||
    run.staleAfterSeconds < minimumStaleSeconds ||
    run.staleAfterSeconds > maximumStaleSeconds
  ) {
    errors.push("STALE_THRESHOLD_INVALID");
  }
  if (startedAt === null) errors.push("STARTED_AT_INVALID");
  if (heartbeatAt === null) errors.push("HEARTBEAT_AT_INVALID");
  if (updatedAt === null) errors.push("UPDATED_AT_INVALID");
  if (run.finishedAt !== null && finishedAt === null) {
    errors.push("FINISHED_AT_INVALID");
  }
  if (
    startedAt !== null &&
    heartbeatAt !== null &&
    Date.parse(heartbeatAt) < Date.parse(startedAt)
  ) {
    errors.push("HEARTBEAT_PRECEDES_START");
  }
  if (
    heartbeatAt !== null &&
    updatedAt !== null &&
    Date.parse(updatedAt) < Date.parse(heartbeatAt)
  ) {
    errors.push("UPDATE_PRECEDES_HEARTBEAT");
  }

  const blocker = normalizedNullableText(run.blocker);
  const nextAction = normalizedNullableText(run.nextAction);
  if (run.status === "running") {
    if (blocker !== null) errors.push("RUNNING_BLOCKER_FORBIDDEN");
    if (nextAction === null) errors.push("RUNNING_NEXT_ACTION_REQUIRED");
    if (run.finishedAt !== null) {
      errors.push("NONTERMINAL_FINISHED_AT_FORBIDDEN");
    }
  } else if (run.status === "blocked") {
    if (blocker === null) errors.push("BLOCKED_BLOCKER_REQUIRED");
    if (nextAction === null) errors.push("BLOCKED_NEXT_ACTION_REQUIRED");
    if (run.finishedAt !== null) {
      errors.push("NONTERMINAL_FINISHED_AT_FORBIDDEN");
    }
  } else if (run.status === "completed") {
    if (run.progress !== 100) errors.push("COMPLETED_PROGRESS_INVALID");
    if (blocker !== null) errors.push("COMPLETED_BLOCKER_FORBIDDEN");
    if (nextAction !== null) errors.push("COMPLETED_NEXT_ACTION_FORBIDDEN");
    if (finishedAt === null) errors.push("TERMINAL_FINISHED_AT_REQUIRED");
  } else if (run.status === "failed" || run.status === "cancelled") {
    if (blocker === null) errors.push("TERMINAL_REASON_REQUIRED");
    if (nextAction !== null) errors.push("TERMINAL_NEXT_ACTION_FORBIDDEN");
    if (finishedAt === null) errors.push("TERMINAL_FINISHED_AT_REQUIRED");
  }

  return errors;
}

function transitionProgressErrors(
  current: number,
  proposed: number | undefined,
): RunTransitionValidationError[] {
  if (proposed === undefined) return [];
  if (!validProgress(proposed)) return ["PROGRESS_INVALID"];
  if (proposed < current) return ["PROGRESS_REGRESSION"];
  return [];
}

function applySharedUpdates(
  run: CooperativeRunSnapshot,
  input: {
    progress?: number;
    summary?: string;
    phase?: string | null;
    branch?: string | null;
    nextAction?: string | null;
  },
  now: string,
): CooperativeRunSnapshot {
  return {
    ...run,
    ...(input.progress === undefined ? {} : { progress: input.progress }),
    ...(input.summary === undefined
      ? {}
      : { summary: normalizedText(input.summary) }),
    ...(input.phase === undefined
      ? {}
      : { phase: normalizedNullableText(input.phase) }),
    ...(input.branch === undefined
      ? {}
      : { branch: normalizedNullableText(input.branch) }),
    ...(input.nextAction === undefined
      ? {}
      : { nextAction: normalizedNullableText(input.nextAction) }),
    lastHeartbeatAt: now,
    updatedAt: now,
  };
}

export function deriveRunFreshness(
  run: CooperativeRunSnapshot,
  observedAtValue: string,
): RunFreshness {
  const observedAt = normalizedIso(observedAtValue);
  if (observedAt === null) throw new Error("RUN_OBSERVED_AT_INVALID");
  if (terminalStatuses.has(run.status)) {
    return { status: "current", staleAt: null };
  }

  const heartbeatAt = normalizedIso(run.lastHeartbeatAt);
  if (heartbeatAt === null) throw new Error("RUN_HEARTBEAT_AT_INVALID");
  if (
    !Number.isInteger(run.staleAfterSeconds) ||
    run.staleAfterSeconds < minimumStaleSeconds ||
    run.staleAfterSeconds > maximumStaleSeconds
  ) {
    throw new Error("RUN_STALE_THRESHOLD_INVALID");
  }

  const staleAt = new Date(
    Date.parse(heartbeatAt) + run.staleAfterSeconds * 1_000,
  ).toISOString();
  return {
    status:
      Date.parse(observedAt) >= Date.parse(staleAt) ? "stale" : "current",
    staleAt,
  };
}

export function applyRunTransition(
  run: CooperativeRunSnapshot,
  command: RunTransitionCommand,
  context: RunTransitionContext,
): RunTransitionResult {
  const stateErrors = validateRunState(run);
  if (stateErrors.length > 0) {
    return { ok: false, code: "INVALID_CURRENT_STATE", errors: stateErrors };
  }
  if (terminalStatuses.has(run.status)) {
    return { ok: false, code: "TERMINAL_RUN" };
  }

  const expectedUpdatedAt = normalizedIso(context.expectedUpdatedAt);
  if (
    expectedUpdatedAt !== null &&
    expectedUpdatedAt !== normalizedIso(run.updatedAt)
  ) {
    return { ok: false, code: "STALE_STATE" };
  }

  const now = normalizedIso(context.now);
  const validationErrors: RunTransitionValidationError[] = [];
  if (now === null) validationErrors.push("TRANSITION_TIME_INVALID");
  if (expectedUpdatedAt === null) {
    validationErrors.push("EXPECTED_UPDATED_AT_INVALID");
  }
  if (
    now !== null &&
    Date.parse(now) < Date.parse(run.updatedAt)
  ) {
    validationErrors.push("TRANSITION_TIME_PRECEDES_STATE");
  }

  if (command.kind === "heartbeat") {
    const nextAction =
      command.nextAction === undefined
        ? run.nextAction
        : normalizedNullableText(command.nextAction);
    if (run.status === "running" && nextAction === null) {
      validationErrors.push("NEXT_ACTION_REQUIRED");
    }
  } else if (command.kind === "checkpoint") {
    validationErrors.push(...transitionProgressErrors(run.progress, command.progress));
    if (normalizedText(command.summary).length === 0) {
      validationErrors.push("SUMMARY_REQUIRED");
    }
    if (normalizedText(command.nextAction).length === 0) {
      validationErrors.push("NEXT_ACTION_REQUIRED");
    }
  } else if (command.kind === "block") {
    if (run.status !== "running") validationErrors.push("INVALID_TRANSITION");
    validationErrors.push(...transitionProgressErrors(run.progress, command.progress));
    if (normalizedText(command.blocker).length === 0) {
      validationErrors.push("BLOCKER_REQUIRED");
    }
    if (normalizedText(command.nextAction).length === 0) {
      validationErrors.push("NEXT_ACTION_REQUIRED");
    }
    if (normalizedText(command.summary).length === 0) {
      validationErrors.push("SUMMARY_REQUIRED");
    }
  } else if (command.kind === "resume") {
    if (run.status !== "blocked") validationErrors.push("INVALID_TRANSITION");
    validationErrors.push(...transitionProgressErrors(run.progress, command.progress));
    if (normalizedText(command.summary).length === 0) {
      validationErrors.push("SUMMARY_REQUIRED");
    }
    if (normalizedText(command.nextAction).length === 0) {
      validationErrors.push("NEXT_ACTION_REQUIRED");
    }
  } else if (command.kind === "complete") {
    if (run.status !== "running") validationErrors.push("INVALID_TRANSITION");
    validationErrors.push(...transitionProgressErrors(run.progress, command.progress));
    if (command.progress !== 100 && validProgress(command.progress)) {
      validationErrors.push("PROGRESS_INVALID");
    }
    if (normalizedText(command.summary).length === 0) {
      validationErrors.push("SUMMARY_REQUIRED");
    }
  } else if (command.kind === "fail") {
    if (normalizedText(command.reason).length === 0) {
      validationErrors.push("REASON_REQUIRED");
    }
    if (normalizedText(command.summary).length === 0) {
      validationErrors.push("SUMMARY_REQUIRED");
    }
  } else {
    if (normalizedText(command.reason).length === 0) {
      validationErrors.push("REASON_REQUIRED");
    }
  }

  if (validationErrors.length > 0 || now === null) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      errors: validationErrors,
    };
  }

  let after: CooperativeRunSnapshot;
  let eventKind: RunTransitionEventKind;
  let eventSummary: string;

  if (command.kind === "heartbeat") {
    after = applySharedUpdates(
      run,
      {
        ...(command.summary === undefined ? {} : { summary: command.summary }),
        ...(command.phase === undefined ? {} : { phase: command.phase }),
        ...(command.branch === undefined ? {} : { branch: command.branch }),
        ...(command.nextAction === undefined
          ? {}
          : { nextAction: command.nextAction }),
      },
      now,
    );
    eventKind = "run.heartbeat";
    eventSummary = normalizedText(command.summary) || after.summary;
  } else if (command.kind === "checkpoint") {
    after = applySharedUpdates(
      run,
      {
        ...(command.progress === undefined ? {} : { progress: command.progress }),
        summary: command.summary,
        ...(command.phase === undefined ? {} : { phase: command.phase }),
        ...(command.branch === undefined ? {} : { branch: command.branch }),
        nextAction: command.nextAction,
      },
      now,
    );
    eventKind = "run.checkpoint";
    eventSummary = normalizedText(command.summary);
  } else if (command.kind === "block") {
    after = {
      ...applySharedUpdates(
        run,
        {
          ...(command.progress === undefined ? {} : { progress: command.progress }),
          summary: command.summary,
          nextAction: command.nextAction,
        },
        now,
      ),
      status: "blocked",
      blocker: normalizedText(command.blocker),
      finishedAt: null,
    };
    eventKind = "run.blocked";
    eventSummary = normalizedText(command.summary);
  } else if (command.kind === "resume") {
    after = {
      ...applySharedUpdates(
        run,
        {
          ...(command.progress === undefined ? {} : { progress: command.progress }),
          summary: command.summary,
          ...(command.phase === undefined ? {} : { phase: command.phase }),
          ...(command.branch === undefined ? {} : { branch: command.branch }),
          nextAction: command.nextAction,
        },
        now,
      ),
      status: "running",
      blocker: null,
      finishedAt: null,
    };
    eventKind = "run.resumed";
    eventSummary = normalizedText(command.summary);
  } else if (command.kind === "complete") {
    after = {
      ...run,
      status: "completed",
      progress: 100,
      summary: normalizedText(command.summary),
      blocker: null,
      nextAction: null,
      lastHeartbeatAt: now,
      finishedAt: now,
      updatedAt: now,
    };
    eventKind = "run.completed";
    eventSummary = normalizedText(command.summary);
  } else if (command.kind === "fail") {
    after = {
      ...run,
      status: "failed",
      summary: normalizedText(command.summary),
      blocker: normalizedText(command.reason),
      nextAction: null,
      lastHeartbeatAt: now,
      finishedAt: now,
      updatedAt: now,
    };
    eventKind = "run.failed";
    eventSummary = normalizedText(command.summary);
  } else {
    const reason = normalizedText(command.reason);
    after = {
      ...run,
      status: "cancelled",
      summary: normalizedText(command.summary) || reason,
      blocker: reason,
      nextAction: null,
      lastHeartbeatAt: now,
      finishedAt: now,
      updatedAt: now,
    };
    eventKind = "run.cancelled";
    eventSummary = normalizedText(command.summary) || reason;
  }

  return {
    ok: true,
    before: run,
    after,
    event: {
      kind: eventKind,
      occurredAt: now,
      summary: eventSummary,
    },
  };
}
