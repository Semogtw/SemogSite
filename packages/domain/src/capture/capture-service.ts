export type AttentionType =
  | "blocker"
  | "risk"
  | "decision"
  | "external_dependency"
  | "critical_test";

export type AttentionImpact = "high" | "medium" | "low";

export type CaptureAttentionInput = {
  projectId: string | null;
  type: AttentionType;
  impact: AttentionImpact;
  title: string;
  nextAction: string;
  reason: string;
  confirmed: boolean;
};

export type CaptureContext = {
  actorId: string;
  attentionId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type CapturedAttention = {
  id: string;
  projectId: string | null;
  type: AttentionType;
  status: "open";
  impact: AttentionImpact;
  title: string;
  owner: "owner";
  nextAction: string;
  source: "manual";
  createdAt: string;
  updatedAt: string;
};

export type CaptureAuditEvent = {
  id: string;
  actor: string;
  action: "attention.create";
  entityType: "attention_item";
  entityId: string;
  before: null;
  after: CapturedAttention;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface AttentionCaptureRepository {
  insertAttentionWithAudit(
    attention: CapturedAttention,
    audit: CaptureAuditEvent,
  ): Promise<void>;
}

export type CaptureValidationError =
  | "CONFIRMATION_REQUIRED"
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "NEXT_ACTION_REQUIRED"
  | "NEXT_ACTION_TOO_LONG"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type CaptureAttentionResult =
  | {
      ok: true;
      attention: CapturedAttention;
      audit: CaptureAuditEvent;
    }
  | {
      ok: false;
      errors: readonly CaptureValidationError[];
    };

function validate(input: {
  title: string;
  nextAction: string;
  reason: string;
  confirmed: boolean;
}): CaptureValidationError[] {
  const errors: CaptureValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.title.length === 0) errors.push("TITLE_REQUIRED");
  else if (input.title.length > 160) errors.push("TITLE_TOO_LONG");
  if (input.nextAction.length === 0) errors.push("NEXT_ACTION_REQUIRED");
  else if (input.nextAction.length > 500) errors.push("NEXT_ACTION_TOO_LONG");
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class AttentionCaptureService {
  constructor(private readonly repository: AttentionCaptureRepository) {}

  async capture(
    input: CaptureAttentionInput,
    context: CaptureContext,
  ): Promise<CaptureAttentionResult> {
    const normalized = {
      projectId:
        input.projectId === null || input.projectId.trim().length === 0
          ? null
          : input.projectId.trim(),
      title: input.title.trim(),
      nextAction: input.nextAction.trim(),
      reason: input.reason.trim(),
    };
    const errors = validate({
      title: normalized.title,
      nextAction: normalized.nextAction,
      reason: normalized.reason,
      confirmed: input.confirmed,
    });
    if (errors.length > 0) return { ok: false, errors };

    const attention: CapturedAttention = {
      id: context.attentionId,
      projectId: normalized.projectId,
      type: input.type,
      status: "open",
      impact: input.impact,
      title: normalized.title,
      owner: "owner",
      nextAction: normalized.nextAction,
      source: "manual",
      createdAt: context.now,
      updatedAt: context.now,
    };
    const audit: CaptureAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "attention.create",
      entityType: "attention_item",
      entityId: attention.id,
      before: null,
      after: attention,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };

    await this.repository.insertAttentionWithAudit(attention, audit);
    return { ok: true, attention, audit };
  }
}
