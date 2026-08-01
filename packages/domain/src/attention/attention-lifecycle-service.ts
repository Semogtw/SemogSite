import type { AttentionImpact, AttentionType } from "../capture/capture-service";

export type AttentionLifecycleStatus =
  | "open"
  | "monitoring"
  | "resolved"
  | "dismissed";

export type AttentionLifecycleSnapshot = {
  id: string;
  projectId: string | null;
  type: AttentionType;
  status: AttentionLifecycleStatus;
  impact: AttentionImpact;
  title: string;
  owner: "owner" | "gpt" | "external_environment" | "shared";
  nextAction: string;
  source: "manual" | "github" | "mcp" | "migration" | "seed_demo";
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttentionLifecycleInput = {
  attentionId: string;
  targetStatus: "resolved" | "dismissed";
  reason: string;
  confirmed: boolean;
};

export type AttentionLifecycleContext = {
  actorId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type AttentionLifecycleAuditEvent = {
  id: string;
  actor: string;
  action: "attention.resolve" | "attention.dismiss";
  entityType: "attention_item";
  entityId: string;
  before: AttentionLifecycleSnapshot;
  after: AttentionLifecycleSnapshot;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface AttentionLifecycleRepository {
  findById(id: string): Promise<AttentionLifecycleSnapshot | null>;
  transitionWithAudit(
    before: AttentionLifecycleSnapshot,
    after: AttentionLifecycleSnapshot,
    audit: AttentionLifecycleAuditEvent,
  ): Promise<boolean>;
}

export type AttentionLifecycleValidationError =
  | "CONFIRMATION_REQUIRED"
  | "ATTENTION_ID_REQUIRED"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type AttentionLifecycleResult =
  | {
      ok: true;
      attention: AttentionLifecycleSnapshot;
      audit: AttentionLifecycleAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly AttentionLifecycleValidationError[];
    }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_FINAL" | "CONFLICT" };

function validate(input: {
  attentionId: string;
  reason: string;
  confirmed: boolean;
}): AttentionLifecycleValidationError[] {
  const errors: AttentionLifecycleValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.attentionId.length === 0) errors.push("ATTENTION_ID_REQUIRED");
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class AttentionLifecycleService {
  constructor(private readonly repository: AttentionLifecycleRepository) {}

  async transition(
    input: AttentionLifecycleInput,
    context: AttentionLifecycleContext,
  ): Promise<AttentionLifecycleResult> {
    const normalized = {
      attentionId: input.attentionId.trim(),
      reason: input.reason.trim(),
    };
    const errors = validate({
      ...normalized,
      confirmed: input.confirmed,
    });
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findById(normalized.attentionId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.status === "resolved" || before.status === "dismissed") {
      return { ok: false, code: "ALREADY_FINAL" };
    }

    const after: AttentionLifecycleSnapshot = {
      ...before,
      status: input.targetStatus,
      resolvedAt: context.now,
      updatedAt: context.now,
    };
    const audit: AttentionLifecycleAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action:
        input.targetStatus === "resolved"
          ? "attention.resolve"
          : "attention.dismiss",
      entityType: "attention_item",
      entityId: before.id,
      before,
      after,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };

    const transitioned = await this.repository.transitionWithAudit(
      before,
      after,
      audit,
    );
    if (!transitioned) return { ok: false, code: "CONFLICT" };

    return { ok: true, attention: after, audit };
  }
}
