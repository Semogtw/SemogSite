import {
  applyRunTransition,
  type CooperativeRunOrigin,
  type CooperativeRunSnapshot,
  type RunStateValidationError,
  type RunTransitionCommand,
  type RunTransitionEventKind,
  type RunTransitionValidationError,
} from "./run-state";

export type CooperativeRunTransitionInput = {
  runId: string;
  command: RunTransitionCommand;
};

export type CooperativeRunTransitionContext = {
  actorId: string;
  eventId: string;
  idempotencyKey: string;
  correlationId: string;
  source: CooperativeRunOrigin;
  now: string;
  expectedUpdatedAt: string;
};

export type CooperativeRunEvent = {
  id: string;
  runId: string;
  kind: RunTransitionEventKind;
  actor: string;
  source: CooperativeRunOrigin;
  summary: string;
  before: CooperativeRunSnapshot;
  after: CooperativeRunSnapshot;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export type CooperativeRunTransitionStoreResult =
  | "updated"
  | "duplicate"
  | "conflict";

export interface CooperativeRunTransitionRepository {
  findRun(runId: string): Promise<CooperativeRunSnapshot | null>;
  apply(
    before: CooperativeRunSnapshot,
    after: CooperativeRunSnapshot,
    event: CooperativeRunEvent,
  ): Promise<CooperativeRunTransitionStoreResult>;
}

export type CooperativeRunTransitionServiceValidationError =
  | "RUN_ID_REQUIRED"
  | "EVENT_ID_REQUIRED"
  | "ACTOR_ID_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CORRELATION_ID_REQUIRED";

export type CooperativeRunTransitionServiceResult =
  | {
      ok: true;
      run: CooperativeRunSnapshot;
      event: CooperativeRunEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly (
        | CooperativeRunTransitionServiceValidationError
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

function text(value: string): string {
  return value.trim();
}

export class CooperativeRunTransitionService {
  constructor(
    private readonly repository: CooperativeRunTransitionRepository,
  ) {}

  async transition(
    input: CooperativeRunTransitionInput,
    context: CooperativeRunTransitionContext,
  ): Promise<CooperativeRunTransitionServiceResult> {
    const runId = text(input.runId);
    const eventId = text(context.eventId);
    const actorId = text(context.actorId);
    const idempotencyKey = text(context.idempotencyKey);
    const correlationId = text(context.correlationId);
    const errors: CooperativeRunTransitionServiceValidationError[] = [];

    if (runId.length === 0) errors.push("RUN_ID_REQUIRED");
    if (eventId.length === 0) errors.push("EVENT_ID_REQUIRED");
    if (actorId.length === 0) errors.push("ACTOR_ID_REQUIRED");
    if (idempotencyKey.length === 0) {
      errors.push("IDEMPOTENCY_KEY_REQUIRED");
    }
    if (correlationId.length === 0) {
      errors.push("CORRELATION_ID_REQUIRED");
    }
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findRun(runId);
    if (before === null) return { ok: false, code: "RUN_NOT_FOUND" };

    const transition = applyRunTransition(before, input.command, {
      now: context.now,
      expectedUpdatedAt: context.expectedUpdatedAt,
    });
    if (!transition.ok) return transition;

    const event: CooperativeRunEvent = {
      id: eventId,
      runId,
      kind: transition.event.kind,
      actor: actorId,
      source: context.source,
      summary: transition.event.summary,
      before: transition.before,
      after: transition.after,
      occurredAt: transition.event.occurredAt,
      idempotencyKey,
      correlationId,
    };

    const stored = await this.repository.apply(
      transition.before,
      transition.after,
      event,
    );
    if (stored === "updated") {
      return { ok: true, run: transition.after, event };
    }
    if (stored === "duplicate") return { ok: false, code: "DUPLICATE" };
    return { ok: false, code: "CONFLICT" };
  }
}
