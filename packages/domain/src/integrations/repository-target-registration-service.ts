export type RepositorySyncTargetRole =
  | "product"
  | "core"
  | "integration"
  | "infrastructure"
  | "academic"
  | "experiment";

export type RegisteredRepositorySyncTarget = {
  id: string;
  projectId: string;
  githubNodeId: null;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  visibility: "private";
  defaultBranch: string;
  activeBranch: null;
  role: RepositorySyncTargetRole;
  syncEnabled: true;
  status: "active";
  lastSyncedAt: null;
  dataSource: "manual";
  createdAt: string;
  updatedAt: string;
};

export type RegisterRepositorySyncTargetInput = {
  projectId: string;
  fullName: string;
  defaultBranch: string;
  role: RepositorySyncTargetRole;
  reason: string;
  confirmed: boolean;
};

export type RepositorySyncTargetRegistrationContext = {
  actorId: string;
  repositoryId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type RepositorySyncTargetRegistrationAuditEvent = {
  id: string;
  actor: string;
  action: "repository.sync_target.create";
  entityType: "repository";
  entityId: string;
  before: null;
  after: RegisteredRepositorySyncTarget;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export type RepositorySyncTargetRegistrationStoreResult =
  | "created"
  | "project_not_found"
  | "duplicate"
  | "conflict";

export interface RepositorySyncTargetRegistrationRepository {
  createWithAudit(
    target: RegisteredRepositorySyncTarget,
    audit: RepositorySyncTargetRegistrationAuditEvent,
  ): Promise<RepositorySyncTargetRegistrationStoreResult>;
}

export type RepositoryTargetRegistrationValidationError =
  | "CONFIRMATION_REQUIRED"
  | "PROJECT_ID_REQUIRED"
  | "FULL_NAME_INVALID"
  | "DEFAULT_BRANCH_INVALID"
  | "ROLE_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type RepositoryTargetRegistrationResult =
  | {
      ok: true;
      target: RegisteredRepositorySyncTarget;
      audit: RepositorySyncTargetRegistrationAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly RepositoryTargetRegistrationValidationError[];
    }
  | {
      ok: false;
      code: "PROJECT_NOT_FOUND" | "DUPLICATE_REPOSITORY" | "CONFLICT";
    };

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;
const repositoryPattern = /^[A-Za-z0-9._-]{1,100}$/u;
const branchPattern = /^[^\u0000-\u0020\u007f]{1,255}$/u;
const roles = new Set<RepositorySyncTargetRole>([
  "product",
  "core",
  "integration",
  "infrastructure",
  "academic",
  "experiment",
]);

function parseFullName(value: string):
  | { owner: string; name: string; fullName: string }
  | null {
  const fullName = value.trim();
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!owner || !name) return null;
  if (!ownerPattern.test(owner) || !repositoryPattern.test(name)) return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

export class RepositoryTargetRegistrationService {
  constructor(
    private readonly repository: RepositorySyncTargetRegistrationRepository,
  ) {}

  async register(
    input: RegisterRepositorySyncTargetInput,
    context: RepositorySyncTargetRegistrationContext,
  ): Promise<RepositoryTargetRegistrationResult> {
    const projectId = input.projectId.trim();
    const identity = parseFullName(input.fullName);
    const defaultBranch = input.defaultBranch.trim();
    const reason = input.reason.trim();
    const errors: RepositoryTargetRegistrationValidationError[] = [];

    if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
    if (projectId.length === 0) errors.push("PROJECT_ID_REQUIRED");
    if (identity === null) errors.push("FULL_NAME_INVALID");
    if (!branchPattern.test(defaultBranch)) {
      errors.push("DEFAULT_BRANCH_INVALID");
    }
    if (!roles.has(input.role)) errors.push("ROLE_INVALID");
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 500) errors.push("REASON_TOO_LONG");

    if (errors.length > 0 || identity === null) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const target: RegisteredRepositorySyncTarget = {
      id: context.repositoryId,
      projectId,
      githubNodeId: null,
      owner: identity.owner,
      name: identity.name,
      fullName: identity.fullName,
      htmlUrl: `https://github.com/${identity.fullName}`,
      visibility: "private",
      defaultBranch,
      activeBranch: null,
      role: input.role,
      syncEnabled: true,
      status: "active",
      lastSyncedAt: null,
      dataSource: "manual",
      createdAt: context.now,
      updatedAt: context.now,
    };
    const audit: RepositorySyncTargetRegistrationAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "repository.sync_target.create",
      entityType: "repository",
      entityId: target.id,
      before: null,
      after: target,
      reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };
    const stored = await this.repository.createWithAudit(target, audit);
    if (stored === "project_not_found") {
      return { ok: false, code: "PROJECT_NOT_FOUND" };
    }
    if (stored === "duplicate") {
      return { ok: false, code: "DUPLICATE_REPOSITORY" };
    }
    if (stored === "conflict") {
      return { ok: false, code: "CONFLICT" };
    }
    return { ok: true, target, audit };
  }
}
