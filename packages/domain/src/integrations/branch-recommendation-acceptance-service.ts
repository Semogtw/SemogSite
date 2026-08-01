import type { ObservationConfidence } from "./repository-observation";

export type RepositoryBranchSnapshot = {
  id: string;
  fullName: string;
  activeBranch: string | null;
  defaultBranch: string;
  updatedAt: string;
};

export type RepositoryBranchRecommendationSnapshot = {
  id: string;
  status: "unavailable" | "recommended";
  branch: string | null;
  confidence: ObservationConfidence;
  observedAt: string;
};

export type RepositoryBranchCandidate = {
  repository: RepositoryBranchSnapshot;
  recommendation: RepositoryBranchRecommendationSnapshot | null;
};

export type AcceptBranchRecommendationInput = {
  repositoryId: string;
  recommendationId: string;
  expectedActiveBranch: string | null;
  reason: string;
  confirmed: boolean;
};

export type BranchRecommendationAcceptanceContext = {
  actorId: string;
  auditId: string;
  correlationId: string;
  now: string;
};

export type BranchRecommendationAcceptanceAuditEvent = {
  id: string;
  actor: string;
  action: "repository.active_branch.accept";
  entityType: "repository";
  entityId: string;
  before: RepositoryBranchCandidate;
  after: RepositoryBranchCandidate;
  reason: string;
  occurredAt: string;
  source: "manual";
  confirmed: true;
  correlationId: string;
};

export interface BranchRecommendationAcceptanceRepository {
  findCandidate(repositoryId: string): Promise<RepositoryBranchCandidate | null>;
  acceptWithAudit(
    before: RepositoryBranchCandidate,
    after: RepositoryBranchCandidate,
    audit: BranchRecommendationAcceptanceAuditEvent,
  ): Promise<boolean>;
}

export type BranchRecommendationAcceptanceValidationError =
  | "CONFIRMATION_REQUIRED"
  | "REPOSITORY_ID_REQUIRED"
  | "RECOMMENDATION_ID_REQUIRED"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG";

export type BranchRecommendationAcceptanceResult =
  | {
      ok: true;
      candidate: RepositoryBranchCandidate;
      audit: BranchRecommendationAcceptanceAuditEvent;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly BranchRecommendationAcceptanceValidationError[];
    }
  | {
      ok: false;
      code:
        | "REPOSITORY_NOT_FOUND"
        | "RECOMMENDATION_NOT_FOUND"
        | "STALE_RECOMMENDATION"
        | "RECOMMENDATION_UNAVAILABLE"
        | "STALE_ACTIVE_BRANCH"
        | "ALREADY_ACTIVE"
        | "CONFLICT";
    };

function normalizeBranch(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function validateInput(input: {
  repositoryId: string;
  recommendationId: string;
  reason: string;
  confirmed: boolean;
}): BranchRecommendationAcceptanceValidationError[] {
  const errors: BranchRecommendationAcceptanceValidationError[] = [];
  if (!input.confirmed) errors.push("CONFIRMATION_REQUIRED");
  if (input.repositoryId.length === 0) errors.push("REPOSITORY_ID_REQUIRED");
  if (input.recommendationId.length === 0) {
    errors.push("RECOMMENDATION_ID_REQUIRED");
  }
  if (input.reason.length === 0) errors.push("REASON_REQUIRED");
  else if (input.reason.length > 500) errors.push("REASON_TOO_LONG");
  return errors;
}

export class BranchRecommendationAcceptanceService {
  constructor(
    private readonly repository: BranchRecommendationAcceptanceRepository,
  ) {}

  async accept(
    input: AcceptBranchRecommendationInput,
    context: BranchRecommendationAcceptanceContext,
  ): Promise<BranchRecommendationAcceptanceResult> {
    const normalized = {
      repositoryId: input.repositoryId.trim(),
      recommendationId: input.recommendationId.trim(),
      expectedActiveBranch: normalizeBranch(input.expectedActiveBranch),
      reason: input.reason.trim(),
    };
    const errors = validateInput({
      repositoryId: normalized.repositoryId,
      recommendationId: normalized.recommendationId,
      reason: normalized.reason,
      confirmed: input.confirmed,
    });
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.findCandidate(
      normalized.repositoryId,
    );
    if (before === null) {
      return { ok: false, code: "REPOSITORY_NOT_FOUND" };
    }
    if (before.recommendation === null) {
      return { ok: false, code: "RECOMMENDATION_NOT_FOUND" };
    }
    if (before.recommendation.id !== normalized.recommendationId) {
      return { ok: false, code: "STALE_RECOMMENDATION" };
    }
    if (
      before.recommendation.status !== "recommended" ||
      normalizeBranch(before.recommendation.branch) === null
    ) {
      return { ok: false, code: "RECOMMENDATION_UNAVAILABLE" };
    }

    const currentActiveBranch = normalizeBranch(before.repository.activeBranch);
    if (currentActiveBranch !== normalized.expectedActiveBranch) {
      return { ok: false, code: "STALE_ACTIVE_BRANCH" };
    }
    const recommendedBranch = normalizeBranch(before.recommendation.branch)!;
    if (currentActiveBranch === recommendedBranch) {
      return { ok: false, code: "ALREADY_ACTIVE" };
    }

    const after: RepositoryBranchCandidate = {
      repository: {
        ...before.repository,
        activeBranch: recommendedBranch,
        updatedAt: context.now,
      },
      recommendation: before.recommendation,
    };
    const audit: BranchRecommendationAcceptanceAuditEvent = {
      id: context.auditId,
      actor: context.actorId,
      action: "repository.active_branch.accept",
      entityType: "repository",
      entityId: before.repository.id,
      before,
      after,
      reason: normalized.reason,
      occurredAt: context.now,
      source: "manual",
      confirmed: true,
      correlationId: context.correlationId,
    };
    const accepted = await this.repository.acceptWithAudit(
      before,
      after,
      audit,
    );
    if (!accepted) return { ok: false, code: "CONFLICT" };

    return { ok: true, candidate: after, audit };
  }
}
