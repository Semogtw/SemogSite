import {
  validateStage,
  type StageSnapshot,
  type StageValidationError,
} from "./stage";

export type CompleteStageInput = {
  stageId: string;
  reason: string;
  confirmed: boolean;
};

export type StageCompletionContext = {
  actorId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type StageCompletionAuditEvent = {
  id: string;
  actor: string;
  action: "stage.complete";
  entityType: "stage";
  entityId: string;
  before: StageSnapshot;
  after: StageSnapshot;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface StageCompletionRepository {
  findById(id: string): Promise<StageSnapshot | null>;
  completeWithAudit(
    before: StageSnapshot,
    after: StageSnapshot,
    audit: StageCompletionAuditEvent,
  ): Promise<boolean>;
}

export type StageCompletionValidationError =
  | "CONFIRMATION_REQUIRED"
  | "STAGE_ID_REQUIRED"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type StageCompletionResult =
  | {
      ok: true;
      stage: StageSnapshot;
      audit: StageCompletionAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly StageCompletionValidationError[];
    }
  | {
      ok: false;
      code: "INVARIANT_FAILED";
      errors: readonly StageValidationError[];
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "ALREADY_COMPLETED" | "CONFLICT";
    };

function validateInput(input: {
  stageId: string;
  reason: string;
  confirmed: boolean;
}): StageCompletionValidationError[] {
  const errors: StageCompletionValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.stageId.length === 0) errors.push("STAGE_ID_REQUIRED");
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class StageCompletionService {
  constructor(private readonly repository: StageCompletionRepository) {}

  async complete(
    input: CompleteStageInput,
    context: StageCompletionContext,
  ): Promise<StageCompletionResult> {
    const normalized = {
      stageId: input.stageId.trim(),
      reason: input.reason.trim(),
    };
    const inputErrors = validateInput({
      ...normalized,
      confirmed: input.confirmed,
    });
    if (inputErrors.length > 0) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: inputErrors,
      };
    }

    const before = await this.repository.findById(normalized.stageId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.state === "completed") {
      return { ok: false, code: "ALREADY_COMPLETED" };
    }

    const after: StageSnapshot = {
      ...before,
      state: "completed",
      progress: 100,
      done: true,
      nextStep: null,
      blocker: null,
      manualLock: true,
      updatedAt: context.now,
    };
    const invariant = validateStage(after);
    if (!invariant.ok) {
      return {
        ok: false,
        code: "INVARIANT_FAILED",
        errors: invariant.errors,
      };
    }

    const audit: StageCompletionAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "stage.complete",
      entityType: "stage",
      entityId: before.id,
      before,
      after,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };
    const transitioned = await this.repository.completeWithAudit(
      before,
      after,
      audit,
    );
    if (!transitioned) return { ok: false, code: "CONFLICT" };

    return { ok: true, stage: after, audit };
  }
}
