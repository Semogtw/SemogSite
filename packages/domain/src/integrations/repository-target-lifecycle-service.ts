export type RepositorySyncTargetLifecycleSnapshot = {
  id: string;
  fullName: string;
  syncEnabled: boolean;
  updatedAt: string;
};

export type ChangeRepositorySyncTargetInput = {
  repositoryId: string;
  desiredSyncEnabled: boolean;
  expectedSyncEnabled: boolean;
  expectedUpdatedAt: string;
  reason: string;
  confirmed: boolean;
};

export type RepositorySyncTargetLifecycleContext = {
  actorId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type RepositorySyncTargetLifecycleAuditEvent = {
  id: string;
  actor: string;
  action:
    | "repository.sync_target.enable"
    | "repository.sync_target.disable";
  entityType: "repository";
  entityId: string;
  before: RepositorySyncTargetLifecycleSnapshot;
  after: RepositorySyncTargetLifecycleSnapshot;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface RepositorySyncTargetLifecycleRepository {
  findTarget(
    repositoryId: string,
  ): Promise<RepositorySyncTargetLifecycleSnapshot | null>;
  changeWithAudit(
    before: RepositorySyncTargetLifecycleSnapshot,
    after: RepositorySyncTargetLifecycleSnapshot,
    audit: RepositorySyncTargetLifecycleAuditEvent,
  ): Promise<boolean>;
}

export type RepositoryTargetLifecycleValidationError =
  | "CONFIRMATION_REQUIRED"
  | "REPOSITORY_ID_REQUIRED"
  | "EXPECTED_UPDATED_AT_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type RepositoryTargetLifecycleResult =
  | {
      ok: true;
      target: RepositorySyncTargetLifecycleSnapshot;
      audit: RepositorySyncTargetLifecycleAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly RepositoryTargetLifecycleValidationError[];
    }
  | {
      ok: false;
      code:
        | "REPOSITORY_NOT_FOUND"
        | "STALE_STATE"
        | "ALREADY_APPLIED"
        | "CONFLICT";
    };

function normalizedIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

export class RepositoryTargetLifecycleService {
  constructor(
    private readonly repository: RepositorySyncTargetLifecycleRepository,
  ) {}

  async change(
    input: ChangeRepositorySyncTargetInput,
    context: RepositorySyncTargetLifecycleContext,
  ): Promise<RepositoryTargetLifecycleResult> {
    const repositoryId = input.repositoryId.trim();
    const expectedUpdatedAt = normalizedIso(input.expectedUpdatedAt);
    const reason = input.reason.trim();
    const errors: RepositoryTargetLifecycleValidationError[] = [];

    if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (repositoryId.length === 0) errors.push("REPOSITORY_ID_REQUIRED");
    if (expectedUpdatedAt === null) {
      errors.push("EXPECTED_UPDATED_AT_INVALID");
    }
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 500) errors.push("REASON_TOO_LONG");

    if (errors.length > 0 || expectedUpdatedAt === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findTarget(repositoryId);
    if (before === null) {
      return { ok: false, code: "REPOSITORY_NOT_FOUND" };
    }
    if (
      before.syncEnabled !== input.expectedSyncEnabled ||
      normalizedIso(before.updatedAt) !== expectedUpdatedAt
    ) {
      return { ok: false, code: "STALE_STATE" };
    }
    if (before.syncEnabled === input.desiredSyncEnabled) {
      return { ok: false, code: "ALREADY_APPLIED" };
    }

    const after: RepositorySyncTargetLifecycleSnapshot = {
      ...before,
      syncEnabled: input.desiredSyncEnabled,
      updatedAt: context.now,
    };
    const audit: RepositorySyncTargetLifecycleAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: input.desiredSyncEnabled
        ? "repository.sync_target.enable"
        : "repository.sync_target.disable",
      entityType: "repository",
      entityId: before.id,
      before,
      after,
      reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };
    const changed = await this.repository.changeWithAudit(before, after, audit);
    if (!changed) return { ok: false, code: "CONFLICT" };

    return { ok: true, target: after, audit };
  }
}
