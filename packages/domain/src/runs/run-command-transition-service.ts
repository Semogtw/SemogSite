import type {
  CooperativeRunCommandKind,
  CooperativeRunCommandPayload,
} from "./run-command-queue-service";
import type { CooperativeRunOrigin } from "./run-state";

export type CooperativeRunCommandLifecycleStatus =
  | "queued"
  | "acknowledged"
  | "completed"
  | "rejected"
  | "expired";

export type CooperativeRunCommandLifecycleSnapshot = {
  id: string;
  runId: string;
  kind: CooperativeRunCommandKind;
  status: CooperativeRunCommandLifecycleStatus;
  summary: string;
  payload: CooperativeRunCommandPayload;
  reason: string | null;
  queuedBy: string;
  idempotencyKey: string;
  correlationId: string;
  queuedAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
};

export type CooperativeRunCommandTransitionAction =
  | { kind: "acknowledge"; summary?: string }
  | { kind: "complete"; summary: string }
  | { kind: "reject"; reason: string; summary?: string };

export type CooperativeRunCommandTransitionInput = {
  runId: string;
  commandId: string;
  action: CooperativeRunCommandTransitionAction;
};

export type CooperativeRunCommandTransitionContext = {
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  source: CooperativeRunOrigin;
  now: string;
  expectedUpdatedAt: string;
};

export type CooperativeRunCommandTransitionEvent = {
  id: string;
  runId: string;
  commandId: string;
  kind:
    | "run.command_acknowledged"
    | "run.command_completed"
    | "run.command_rejected";
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before: CooperativeRunCommandLifecycleSnapshot;
  after: CooperativeRunCommandLifecycleSnapshot;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type CooperativeRunCommandTransitionStoreResult =
  | "updated"
  | "duplicate"
  | "conflict";

export interface CooperativeRunCommandTransitionRepository {
  findCommand(
    runId: string,
    commandId: string,
  ): Promise<CooperativeRunCommandLifecycleSnapshot | null>;
  apply(
    before: CooperativeRunCommandLifecycleSnapshot,
    after: CooperativeRunCommandLifecycleSnapshot,
    event: CooperativeRunCommandTransitionEvent,
  ): Promise<CooperativeRunCommandTransitionStoreResult>;
}

export type CooperativeRunCommandTransitionValidationError =
  | "RUN_ID_REQUIRED"
  | "COMMAND_ID_REQUIRED"
  | "EVENT_ID_REQUIRED"
  | "ACTOR_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED"
  | "SOURCE_INVALID"
  | "NOW_INVALID"
  | "EXPECTED_UPDATED_AT_INVALID"
  | "TRANSITION_TIME_PRECEDES_STATE"
  | "SUMMARY_REQUIRED"
  | "SUMMARY_TOO_LONG"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "INVALID_TRANSITION";

export type CooperativeRunCommandTransitionResult =
  | {
      ok: true;
      command: CooperativeRunCommandLifecycleSnapshot;
      event: CooperativeRunCommandTransitionEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly CooperativeRunCommandTransitionValidationError[];
    }
  | {
      ok: false;
      code:
        | "COMMAND_NOT_FOUND"
        | "INVALID_CURRENT_STATE"
        | "STALE_STATE"
        | "COMMAND_EXPIRED"
        | "TERMINAL_COMMAND"
        | "DUPLICATE"
        | "CONFLICT";
    };

const origins = new Set<CooperativeRunOrigin>([
  "chatgpt",
  "codex",
  "manual",
  "automation",
  "other",
]);
const statuses = new Set<CooperativeRunCommandLifecycleStatus>([
  "queued",
  "acknowledged",
  "completed",
  "rejected",
  "expired",
]);
const terminalStatuses = new Set<CooperativeRunCommandLifecycleStatus>([
  "completed",
  "rejected",
  "expired",
]);

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function validCurrentState(
  command: CooperativeRunCommandLifecycleSnapshot,
): boolean {
  const queuedAt = normalizedIso(command.queuedAt);
  const updatedAt = normalizedIso(command.updatedAt);
  const acknowledgedAt =
    command.acknowledgedAt === null
      ? null
      : normalizedIso(command.acknowledgedAt);
  const completedAt =
    command.completedAt === null ? null : normalizedIso(command.completedAt);
  const expiresAt =
    command.expiresAt === null ? null : normalizedIso(command.expiresAt);

  if (
    text(command.id).length === 0 ||
    text(command.runId).length === 0 ||
    !statuses.has(command.status) ||
    queuedAt === null ||
    updatedAt === null ||
    (command.acknowledgedAt !== null && acknowledgedAt === null) ||
    (command.completedAt !== null && completedAt === null) ||
    (command.expiresAt !== null && expiresAt === null)
  ) {
    return false;
  }
  if (Date.parse(updatedAt) < Date.parse(queuedAt)) return false;
  if (
    acknowledgedAt !== null &&
    (Date.parse(acknowledgedAt) < Date.parse(queuedAt) ||
      Date.parse(updatedAt) < Date.parse(acknowledgedAt))
  ) {
    return false;
  }
  if (
    completedAt !== null &&
    (Date.parse(completedAt) < Date.parse(queuedAt) ||
      Date.parse(updatedAt) < Date.parse(completedAt))
  ) {
    return false;
  }

  if (command.status === "queued") {
    return command.acknowledgedAt === null && command.completedAt === null;
  }
  if (command.status === "acknowledged") {
    return acknowledgedAt !== null && command.completedAt === null;
  }
  return completedAt !== null;
}

export class CooperativeRunCommandTransitionService {
  constructor(
    private readonly repository: CooperativeRunCommandTransitionRepository,
  ) {}

  async transition(
    input: CooperativeRunCommandTransitionInput,
    context: CooperativeRunCommandTransitionContext,
  ): Promise<CooperativeRunCommandTransitionResult> {
    const runId = text(input.runId);
    const commandId = text(input.commandId);
    const eventId = text(context.eventId);
    const actorId = text(context.actorId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    const now = normalizedIso(context.now);
    const expectedUpdatedAt = normalizedIso(context.expectedUpdatedAt);
    const errors: CooperativeRunCommandTransitionValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (commandId.length === 0) errors.push("COMMAND_ID_REQUIRED");
    if (eventId.length === 0) errors.push("EVENT_ID_REQUIRED");
    if (actorId.length === 0) errors.push("ACTOR_ID_REQUIRED");
    if (idempotencyKey.length === 0) errors.push("IDEMPOTENCY_KEY_REQUIRED");
    if (correlationId.length === 0) errors.push("CORRELATION_ID_REQUIRED");
    if (!origins.has(context.source)) errors.push("SOURCE_INVALID");
    if (now === null) errors.push("NOW_INVALID");
    if (expectedUpdatedAt === null) {
      errors.push("EXPECTED_UPDATED_AT_INVALID");
    }

    const suppliedSummary =
      input.action.kind === "acknowledge" || input.action.kind === "reject"
        ? text(input.action.summary)
        : text(input.action.summary);
    const reason = input.action.kind === "reject" ? text(input.action.reason) : "";
    if (input.action.kind === "complete") {
      if (suppliedSummary.length === 0) errors.push("SUMMARY_REQUIRED");
      else if (suppliedSummary.length > 1_000) errors.push("SUMMARY_TOO_LONG");
    } else if (input.action.kind === "acknowledge") {
      if (suppliedSummary.length > 1_000) errors.push("SUMMARY_TOO_LONG");
    } else {
      if (reason.length === 0) errors.push("REASON_REQUIRED");
      else if (reason.length > 2_000) errors.push("REASON_TOO_LONG");
      if (suppliedSummary.length > 1_000) errors.push("SUMMARY_TOO_LONG");
    }

    if (errors.length > 0 || now === null || expectedUpdatedAt === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findCommand(runId, commandId);
    if (before === null) return { ok: false, code: "COMMAND_NOT_FOUND" };
    if (!validCurrentState(before) || before.runId !== runId || before.id !== commandId) {
      return { ok: false, code: "INVALID_CURRENT_STATE" };
    }
    if (terminalStatuses.has(before.status)) {
      return { ok: false, code: "TERMINAL_COMMAND" };
    }
    if (normalizedIso(before.updatedAt) !== expectedUpdatedAt) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (Date.parse(now) < Date.parse(before.updatedAt)) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["TRANSITION_TIME_PRECEDES_STATE"],
      };
    }
    if (
      before.expiresAt !== null &&
      Date.parse(now) >= Date.parse(before.expiresAt)
    ) {
      return { ok: false, code: "COMMAND_EXPIRED" };
    }

    let after: CooperativeRunCommandLifecycleSnapshot;
    let eventKind: CooperativeRunCommandTransitionEvent["kind"];
    let eventSummary: string;

    if (input.action.kind === "acknowledge") {
      if (before.status !== "queued") {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: ["INVALID_TRANSITION"],
        };
      }
      eventKind = "run.command_acknowledged";
      eventSummary =
        suppliedSummary.length === 0 ? "Command acknowledged." : suppliedSummary;
      after = {
        ...before,
        status: "acknowledged",
        acknowledgedAt: now,
        updatedAt: now,
      };
    } else if (input.action.kind === "complete") {
      if (before.status !== "acknowledged") {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: ["INVALID_TRANSITION"],
        };
      }
      eventKind = "run.command_completed";
      eventSummary = suppliedSummary;
      after = {
        ...before,
        status: "completed",
        completedAt: now,
        updatedAt: now,
      };
    } else {
      if (before.status !== "queued" && before.status !== "acknowledged") {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: ["INVALID_TRANSITION"],
        };
      }
      eventKind = "run.command_rejected";
      eventSummary =
        suppliedSummary.length === 0 ? "Command rejected." : suppliedSummary;
      after = {
        ...before,
        status: "rejected",
        reason,
        completedAt: now,
        updatedAt: now,
      };
    }

    const event: CooperativeRunCommandTransitionEvent = {
      id: eventId,
      runId,
      commandId,
      kind: eventKind,
      actor: actorId,
      source: context.source,
      summary: eventSummary,
      before,
      after,
      occurredAt: now,
      idempotencyKey,
      correlationId,
    };

    const stored = await this.repository.apply(before, after, event);
    if (stored === "updated") return { ok: true, command: after, event };
    if (stored === "duplicate") return { ok: false, code: "DUPLICATE" };
    return { ok: false, code: "CONFLICT" };
  }
}
